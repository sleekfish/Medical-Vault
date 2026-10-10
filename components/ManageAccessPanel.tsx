import React, { useState, useCallback, useEffect } from "react";
import {
    Shield,
    ShieldCheck,
    ShieldOff,
    User,
    Loader2,
    CheckCircle,
} from "./ui/Icons";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { MedicalRecord } from "../types";
import { API_BASE_URL } from "../services/apiConfig";
import {
    grantDocumentAccess,
    revokeDocumentAccess,
    getDocumentAccessList,
    FabricPermission,
} from "../services/fabricAccessService";

interface Props {
    patientWallet: string;
    records: MedicalRecord[];
    dark?: boolean;
}

interface DoctorConnection {
    id: string;
    patientWallet: string;
    doctorWallet: string;
    patientName?: string;
    doctorName?: string;
    status: string;
    requestedAt?: string;
    connectedAt?: string | null;
    txHash?: string | null;
}

const API = API_BASE_URL;

const EXPIRY_OPTIONS = [
    { label: "1 day", value: 1 },
    { label: "7 days", value: 7 },
    { label: "30 days", value: 30 },
    { label: "Permanent", value: 0 },
];

const STATUS_STYLE: Record<string, string> = {
    ACTIVE: "text-green-500 border-green-500/30 bg-green-500/10",
    EXPIRED: "text-amber-500 border-amber-500/30 bg-amber-500/10",
    REVOKED: "text-red-500 border-red-500/30 bg-red-500/10",
};

const ManageAccessPanel: React.FC<Props> = ({
                                                patientWallet,
                                                records,
                                                dark: darkProp,
                                            }) => {
    const { addToast } = useToast();
    const { theme } = useTheme();

    const dark = darkProp ?? theme === "dark";

    // Document access state
    const [selectedDoc, setSelectedDoc] = useState<string>("");
    const [selectedDoctor, setSelectedDoctor] = useState<string>("");
    const [expiry, setExpiry] = useState<number>(7);

    const [loading, setLoading] = useState(false);
    const [permissions, setPermissions] = useState<FabricPermission[]>([]);
    const [loadingPerms, setLoadingPerms] = useState(false);

    // Real patient-doctor connections
    const [connections, setConnections] = useState<DoctorConnection[]>([]);
    const [loadingDoctors, setLoadingDoctors] = useState(false);

    const card = dark
        ? "bg-[#0f0f0f] border-white/[0.08]"
        : "bg-white border-gray-200 shadow-sm";

    const tx = dark
        ? "text-white"
        : "text-gray-900";

    const t2 = dark
        ? "text-gray-400"
        : "text-gray-500";

    const inp = dark
        ? "bg-black/60 border-white/10 text-white placeholder-gray-600"
        : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400";

    // ============================================================
    // LOAD PATIENT'S REAL DOCTOR CONNECTIONS
    // ============================================================

    const fetchConnectedDoctors = useCallback(async () => {
        if (!patientWallet) {
            setConnections([]);
            return;
        }

        setLoadingDoctors(true);

        try {
            const wallet = patientWallet
                .trim()
                .toLowerCase();

            const response = await fetch(
                `${API}/connection/patient/${wallet}`
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to load doctor connections (${response.status})`
                );
            }

            const data = await response.json();

            setConnections(
                Array.isArray(data) ? data : []
            );
        } catch (error: any) {
            console.error(
                "[ManageAccessPanel] Doctor connection error:",
                error
            );

            setConnections([]);

            addToast(
                "error",
                error?.message ||
                "Could not load connected doctors."
            );
        } finally {
            setLoadingDoctors(false);
        }
    }, [patientWallet, addToast]);

    // Load connections when panel opens.
    // Refresh every 3 seconds so a newly accepted doctor appears.
    useEffect(() => {
        fetchConnectedDoctors();

        const interval = setInterval(
            fetchConnectedDoctors,
            3000
        );

        return () => clearInterval(interval);
    }, [fetchConnectedDoctors]);

    // ============================================================
    // ONLY SHOW CONNECTED DOCTORS
    // ============================================================

    const connectedDoctors = connections.filter(
        (connection) =>
            connection.status === "CONNECTED" &&
            !!connection.doctorWallet
    );

    // If doctor gets disconnected/revoked while selected,
    // clear the selection.
    useEffect(() => {
        if (!selectedDoctor) return;

        const stillConnected = connectedDoctors.some(
            (doctor) =>
                doctor.doctorWallet.toLowerCase() ===
                selectedDoctor.toLowerCase()
        );

        if (!stillConnected) {
            setSelectedDoctor("");
        }
    }, [connectedDoctors, selectedDoctor]);

    // ============================================================
    // LOAD DOCUMENT PERMISSIONS
    // ============================================================

    const refreshPermissions = useCallback(
        async (documentId: string) => {
            if (!documentId) {
                setPermissions([]);
                return;
            }

            setLoadingPerms(true);

            try {
                const list =
                    await getDocumentAccessList(
                        patientWallet,
                        documentId
                    );

                setPermissions(list);
            } catch (error: any) {
                console.error(
                    "[ManageAccessPanel] Permission error:",
                    error
                );

                setPermissions([]);

                addToast(
                    "error",
                    error?.message ||
                    "Could not load permissions."
                );
            } finally {
                setLoadingPerms(false);
            }
        },
        [patientWallet, addToast]
    );

    // ============================================================
    // DOCUMENT CHANGE
    // ============================================================

    const handleDocumentChange = (
        documentId: string
    ) => {
        setSelectedDoc(documentId);

        // Reset doctor whenever another document is selected.
        setSelectedDoctor("");

        if (documentId) {
            refreshPermissions(documentId);
        } else {
            setPermissions([]);
        }
    };

    // ============================================================
    // GRANT DOCUMENT ACCESS
    // ============================================================

    const handleGrant = async () => {
        if (!selectedDoc) {
            addToast(
                "error",
                "Select a document first."
            );
            return;
        }

        if (!selectedDoctor) {
            addToast(
                "error",
                "Select a connected doctor first."
            );
            return;
        }

        // Security check:
        // Make sure the selected doctor is still connected.
        const doctorStillConnected =
            connectedDoctors.some(
                (doctor) =>
                    doctor.doctorWallet.toLowerCase() ===
                    selectedDoctor.toLowerCase()
            );

        if (!doctorStillConnected) {
            addToast(
                "error",
                "This doctor is no longer connected to your account."
            );

            setSelectedDoctor("");

            await fetchConnectedDoctors();

            return;
        }

        setLoading(true);

        try {
            await grantDocumentAccess(
                patientWallet,
                selectedDoc,
                selectedDoctor,
                "VIEW",
                expiry
            );

            addToast(
                "success",
                "Access granted. Permission is now on the ledger."
            );

            await refreshPermissions(selectedDoc);
        } catch (error: any) {
            console.error(
                "[ManageAccessPanel] Grant error:",
                error
            );

            addToast(
                "error",
                error?.message ||
                "Failed to grant access."
            );
        } finally {
            setLoading(false);
        }
    };

    // ============================================================
    // REVOKE DOCUMENT ACCESS
    // ============================================================

    const handleRevoke = async (
        doctorId: string
    ) => {
        if (!selectedDoc) {
            addToast(
                "error",
                "Select a document first."
            );
            return;
        }

        setLoading(true);

        try {
            await revokeDocumentAccess(
                patientWallet,
                selectedDoc,
                doctorId
            );

            addToast(
                "success",
                "Access revoked. The doctor can no longer view this document."
            );

            await refreshPermissions(selectedDoc);
        } catch (error: any) {
            console.error(
                "[ManageAccessPanel] Revoke error:",
                error
            );

            addToast(
                "error",
                error?.message ||
                "Failed to revoke access."
            );
        } finally {
            setLoading(false);
        }
    };

    // ============================================================
    // GET DOCTOR NAME FROM REAL CONNECTION
    // ============================================================

    const doctorName = (wallet: string) => {
        const connection = connections.find(
            (connection) =>
                connection.doctorWallet.toLowerCase() ===
                wallet.toLowerCase()
        );

        return (
            connection?.doctorName ||
            `Doctor ${wallet.slice(
                0,
                8
            )}…${wallet.slice(-6)}`
        );
    };

    const doctorDisplayName = (
        doctor: DoctorConnection
    ) => {
        return (
            doctor.doctorName ||
            `Doctor ${doctor.doctorWallet.slice(
                0,
                8
            )}…${doctor.doctorWallet.slice(-6)}`
        );
    };

    // ============================================================
    // DATE FORMAT
    // ============================================================

    const formatDate = (
        iso: string | null
    ) =>
        iso
            ? new Date(
                iso
            ).toLocaleDateString(
                "en-IN",
                {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                }
            )
            : "—";

    const formatExpiry = (
        perm: FabricPermission
    ) => {
        if (perm.expiresAt === null) {
            return "Permanent";
        }

        return `Expires: ${formatDate(
            perm.expiresAt
        )}`;
    };

    // ============================================================
    // UI
    // ============================================================

    return (
        <div className="space-y-6">

            {/* HEADER */}

            <div>
                <div className="flex items-center gap-2 mb-1">

                    <Shield
                        size={16}
                        className="text-sky-500"
                    />

                    <h3
                        className={`text-sm font-bold ${tx}`}
                    >
                        Manage document access
                    </h3>

                </div>

                <p
                    className={`text-xs ${t2}`}
                >
                    Grant a connected doctor VIEW access
                    to{" "}
                    <span className="font-semibold">
                        one specific document
                    </span>
                    . Documents you do not grant stay
                    hidden from the doctor — on the
                    blockchain.
                </p>
            </div>

            {/* CONNECTED DOCTORS STATUS */}

            <div
                className={`rounded-xl border p-4 ${
                    dark
                        ? "bg-green-500/5 border-green-500/20"
                        : "bg-green-50 border-green-200"
                }`}
            >

                <div className="flex items-center gap-3">

                    <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            dark
                                ? "bg-green-500/10"
                                : "bg-green-100"
                        }`}
                    >
                        <User
                            size={15}
                            className="text-green-500"
                        />
                    </div>

                    <div className="flex-1">

                        <p
                            className={`text-xs font-bold ${
                                dark
                                    ? "text-green-400"
                                    : "text-green-600"
                            }`}
                        >
                            CONNECTED DOCTORS
                        </p>

                        <p
                            className={`text-[11px] mt-0.5 ${t2}`}
                        >
                            Only doctors who have accepted
                            your connection request appear
                            here.
                        </p>

                    </div>

                    <div className="text-right">

                        {loadingDoctors ? (
                            <Loader2
                                size={18}
                                className="animate-spin text-green-500"
                            />
                        ) : (
                            <>
                                <p
                                    className={`text-lg font-bold ${
                                        dark
                                            ? "text-green-400"
                                            : "text-green-600"
                                    }`}
                                >
                                    {
                                        connectedDoctors.length
                                    }
                                </p>

                                <p
                                    className={`text-[9px] uppercase tracking-wide ${t2}`}
                                >
                                    Connected
                                </p>
                            </>
                        )}

                    </div>

                </div>

            </div>

            {/* GRANT ACCESS FORM */}

            <div
                className={`border rounded-xl p-5 ${card}`}
            >

                {/* DOCUMENT + DOCTOR */}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

                    {/* DOCUMENT */}

                    <div>

                        <label
                            className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 block ${t2}`}
                        >
                            Document
                        </label>

                        <select
                            value={selectedDoc}
                            onChange={(e) =>
                                handleDocumentChange(
                                    e.target.value
                                )
                            }
                            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-sky-500 ${inp}`}
                        >

                            <option value="">
                                Select a document…
                            </option>

                            {records.map(
                                (record) => (
                                    <option
                                        key={record.id}
                                        value={record.id}
                                    >
                                        {record.name}
                                    </option>
                                )
                            )}

                        </select>

                    </div>

                    {/* CONNECTED DOCTOR */}

                    <div>

                        <div className="flex items-center justify-between mb-1.5">

                            <label
                                className={`text-[11px] font-semibold uppercase tracking-wide ${t2}`}
                            >
                                Connected Doctor
                            </label>

                            {loadingDoctors && (
                                <Loader2
                                    size={12}
                                    className="animate-spin text-sky-500"
                                />
                            )}

                        </div>

                        <select
                            value={selectedDoctor}
                            onChange={(e) =>
                                setSelectedDoctor(
                                    e.target.value
                                )
                            }
                            disabled={
                                loadingDoctors ||
                                connectedDoctors.length ===
                                0
                            }
                            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-sky-500 disabled:opacity-60 ${inp}`}
                        >

                            <option value="">

                                {loadingDoctors
                                    ? "Loading connected doctors…"
                                    : connectedDoctors.length ===
                                    0
                                        ? "No connected doctors"
                                        : "Select a connected doctor…"}

                            </option>

                            {connectedDoctors.map(
                                (doctor) => (
                                    <option
                                        key={
                                            doctor.doctorWallet
                                        }
                                        value={
                                            doctor.doctorWallet
                                        }
                                    >
                                        {doctorDisplayName(
                                            doctor
                                        )}{" "}
                                        ·{" "}
                                        {doctor.doctorWallet.slice(
                                            0,
                                            8
                                        )}
                                        …
                                        {doctor.doctorWallet.slice(
                                            -6
                                        )}
                                    </option>
                                )
                            )}

                        </select>

                    </div>

                </div>

                {/* PERMISSION + EXPIRY + BUTTON */}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">

                    {/* PERMISSION */}

                    <div>

                        <label
                            className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 block ${t2}`}
                        >
                            Permission
                        </label>

                        <div
                            className={`rounded-lg border px-3 py-2 text-sm flex items-center gap-2 ${inp}`}
                        >
                            <EyeIcon />
                            VIEW
                        </div>

                    </div>

                    {/* EXPIRY */}

                    <div>

                        <label
                            className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 block ${t2}`}
                        >
                            Expiry
                        </label>

                        <select
                            value={expiry}
                            onChange={(e) =>
                                setExpiry(
                                    Number(
                                        e.target.value
                                    )
                                )
                            }
                            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-sky-500 ${inp}`}
                        >

                            {EXPIRY_OPTIONS.map(
                                (option) => (
                                    <option
                                        key={
                                            option.value
                                        }
                                        value={
                                            option.value
                                        }
                                    >
                                        {option.label}
                                    </option>
                                )
                            )}

                        </select>

                    </div>

                    {/* GRANT BUTTON */}

                    <div>

                        <button
                            onClick={handleGrant}
                            disabled={
                                loading ||
                                !selectedDoc ||
                                !selectedDoctor ||
                                connectedDoctors.length ===
                                0
                            }
                            className="w-full flex items-center justify-center gap-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 transition-colors"
                        >

                            {loading ? (
                                <Loader2
                                    size={14}
                                    className="animate-spin"
                                />
                            ) : (
                                <ShieldCheck
                                    size={14}
                                />
                            )}

                            Grant Access

                        </button>

                    </div>

                </div>

            </div>

            {/* PERMISSIONS */}

            <div
                className={`border rounded-xl p-5 ${card}`}
            >

                <div className="flex items-center justify-between mb-3">

                    <h4
                        className={`text-xs font-bold uppercase tracking-wide ${t2}`}
                    >
                        Permissions{" "}

                        {selectedDoc && (
                            <>
                                ·{" "}
                                {
                                    records.find(
                                        (record) =>
                                            record.id ===
                                            selectedDoc
                                    )?.name
                                }
                            </>
                        )}

                    </h4>

                    {loadingPerms && (
                        <Loader2
                            size={13}
                            className="animate-spin text-sky-500"
                        />
                    )}

                </div>

                {!selectedDoc ? (

                    <p
                        className={`text-sm py-4 text-center ${t2}`}
                    >
                        Select a document to see its
                        permissions.
                    </p>

                ) : permissions.length === 0 ? (

                    <p
                        className={`text-sm py-4 text-center ${t2}`}
                    >
                        No permissions yet — this document
                        is private by default.
                    </p>

                ) : (

                    <div className="space-y-2">

                        {permissions.map(
                            (perm) => (

                                <div
                                    key={
                                        perm.permissionId
                                    }
                                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                                        dark
                                            ? "border-white/[0.06]"
                                            : "border-gray-200"
                                    }`}
                                >

                                    {/* DOCTOR */}

                                    <div className="flex items-center gap-2.5 min-w-0">

                                        <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">

                                            <User
                                                size={14}
                                                className="text-sky-500"
                                            />

                                        </div>

                                        <div className="min-w-0">

                                            <p
                                                className={`text-xs font-semibold ${tx}`}
                                            >
                                                {doctorName(
                                                    perm.doctorId
                                                )}
                                            </p>

                                            <p
                                                className={`text-[10px] ${t2} truncate`}
                                            >
                                                {
                                                    perm.permission
                                                }
                                                {" · "}
                                                {formatExpiry(
                                                    perm
                                                )}
                                            </p>

                                        </div>

                                    </div>

                                    {/* STATUS */}

                                    <div className="flex items-center gap-2 shrink-0">

                                        <span
                                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                                                STATUS_STYLE[
                                                    perm.status
                                                    ] || ""
                                            }`}
                                        >
                                            {
                                                perm.status
                                            }
                                        </span>

                                        {perm.status ===
                                            "ACTIVE" && (
                                                <button
                                                    onClick={() =>
                                                        handleRevoke(
                                                            perm.doctorId
                                                        )
                                                    }
                                                    disabled={
                                                        loading
                                                    }
                                                    className="flex items-center gap-1 text-[10px] font-semibold text-red-500 hover:text-red-400 border border-red-500/30 rounded-lg px-2 py-1 disabled:opacity-40"
                                                >

                                                    <ShieldOff
                                                        size={11}
                                                    />

                                                    Revoke

                                                </button>
                                            )}

                                    </div>

                                </div>

                            )
                        )}

                    </div>

                )}

            </div>

            {/* SECURITY NOTE */}

            <p
                className={`text-[10px] ${t2} flex items-center gap-1.5`}
            >

                <CheckCircle
                    size={11}
                    className="text-green-500"
                />

                Expiry is enforced by the chaincode —
                expired permissions are treated as
                unauthorized even if the UI says otherwise.

            </p>

        </div>
    );
};

const EyeIcon = () => (
    <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle
            cx="12"
            cy="12"
            r="3"
        />
    </svg>
);

export default ManageAccessPanel;
