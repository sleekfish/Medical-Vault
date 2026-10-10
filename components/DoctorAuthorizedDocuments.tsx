import React, {
    useState,
    useEffect,
    useCallback,
} from "react";

import {
    FileText,
    Eye,
    RefreshCw,
    Loader2,
    Lock,
} from "./ui/Icons";

import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";

import {
    getDoctorAuthorizedDocuments,
    FabricDoctorDoc,
} from "../services/fabricAccessService";


interface Props {
    doctorWallet: string;

    /*
     * Used when selecting a patient from the
     * authorized-document section.
     */
    onSelectPatient: (
        patientWallet: string,
        patientName: string
    ) => void;

    /*
     * NEW:
     *
     * Opens a specific authorized document.
     *
     * This is intentionally separate from
     * onSelectPatient() so that clicking View
     * does NOT trigger a complete patient-record
     * synchronization.
     */
    onViewDocument: (
        patientWallet: string,
        documentId: string
    ) => void;
}


/**
 * Doctor's authorized documents.
 *
 * Shows ONLY documents for which the doctor has
 * an ACTIVE and unexpired Fabric chaincode permission.
 *
 * The list is obtained from:
 *
 * GetDoctorAuthorizedDocuments
 *
 * The component does NOT attempt to filter the
 * patient's entire medical vault in React.
 */
const DoctorAuthorizedDocuments: React.FC<Props> = ({
                                                        doctorWallet,
                                                        onSelectPatient,
                                                        onViewDocument,
                                                    }) => {

    const { addToast } = useToast();

    const { theme } = useTheme();

    const dark = theme === "dark";


    // ============================================================
    // STATE
    // ============================================================

    const [docs, setDocs] =
        useState<FabricDoctorDoc[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [syncing, setSyncing] =
        useState(false);


    // ============================================================
    // REFRESH AUTHORIZED DOCUMENTS
    // ============================================================

    const refresh = useCallback(
        async () => {

            if (!doctorWallet) {
                return;
            }


            setSyncing(true);


            try {

                /*
                 * IMPORTANT:
                 *
                 * This function only retrieves the list of
                 * documents for which the doctor currently
                 * has blockchain permission.
                 */
                const list =
                    await getDoctorAuthorizedDocuments(
                        doctorWallet
                    );


                setDocs(list);

            } catch (error: any) {

                console.error(
                    "[DoctorAuthorizedDocuments] Failed to load:",
                    error
                );


                setDocs([]);


                addToast(
                    "error",
                    error?.message ||
                    "Could not load authorized documents."
                );

            } finally {

                setLoading(false);

                setSyncing(false);
            }

        },
        [
            doctorWallet,
            addToast,
        ]
    );


    // ============================================================
    // INITIAL LOAD
    // ============================================================

    useEffect(() => {

        setLoading(true);

        refresh();

    }, [refresh]);


    // ============================================================
    // STYLES
    // ============================================================

    const card =
        dark
            ? "bg-[#0f0f0f] border-white/[0.08]"
            : "bg-white border-gray-200 shadow-sm";


    const tx =
        dark
            ? "text-white"
            : "text-gray-900";


    const t2 =
        dark
            ? "text-gray-400"
            : "text-gray-500";


    // ============================================================
    // DATE FORMAT
    // ============================================================

    const formatDate = (
        iso: string | null
    ) => {

        if (!iso) {
            return "Permanent";
        }


        return new Date(
            iso
        ).toLocaleDateString(
            "en-IN",
            {
                day: "numeric",
                month: "short",
                year: "numeric",
            }
        );
    };


    // ============================================================
    // EXPIRING SOON
    // ============================================================

    const isExpiringSoon = (
        iso: string | null
    ) => {

        if (!iso) {
            return false;
        }


        const days =
            (
                new Date(iso).getTime()
                -
                Date.now()
            ) / 86_400_000;


        return (
            days > 0 &&
            days <= 7
        );
    };


    // ============================================================
    // VIEW DOCUMENT
    // ============================================================

    const handleViewDocument = (
        doc: FabricDoctorDoc
    ) => {

        /*
         * IMPORTANT:
         *
         * DO NOT call:
         *
         * onSelectPatient(...)
         *
         * here.
         *
         * That function causes DoctorDashboard to call
         * fetchRecords(), which loads every authorized
         * document and displays the "record(s) synced"
         * toast.
         *
         * Instead, send the exact patient wallet and
         * document ID to the parent.
         */
        onViewDocument(
            doc.patientId,
            doc.documentId
        );
    };


    // ============================================================
    // VIEW
    // ============================================================

    return (

        <div
            className={`border rounded-xl p-5 ${card}`}
        >

            {/* ==================================================
                HEADER
            ================================================== */}

            <div className="flex items-center justify-between mb-4">

                <div className="flex items-center gap-2">

                    <FileText
                        size={16}
                        className="text-green-500"
                    />


                    <div>

                        <h3
                            className={`text-sm font-bold ${tx}`}
                        >
                            My authorized medical documents
                        </h3>


                        <p
                            className={`text-[10px] ${t2}`}
                        >
                            Only documents the patient granted you —
                            verified on the blockchain
                        </p>

                    </div>

                </div>


                {/* ==================================================
                    REFRESH BUTTON
                ================================================== */}

                <button
                    onClick={refresh}
                    disabled={syncing}

                    className="flex items-center gap-1.5 text-xs font-semibold text-green-500 hover:text-green-400 disabled:opacity-40 border border-green-500/20 rounded-lg px-2.5 py-1.5"
                >

                    {syncing ? (

                        <Loader2
                            size={12}
                            className="animate-spin"
                        />

                    ) : (

                        <RefreshCw
                            size={12}
                        />

                    )}


                    Refresh

                </button>

            </div>


            {/* ==================================================
                LOADING
            ================================================== */}

            {loading ? (

                <div
                    className={`text-center py-10 ${t2}`}
                >

                    <Loader2
                        size={18}
                        className="mx-auto mb-2 animate-spin"
                    />


                    <p className="text-xs">
                        Checking the ledger…
                    </p>

                </div>


            ) : docs.length === 0 ? (

                /* ==================================================
                    NO DOCUMENTS
                ================================================== */

                <div
                    className={`text-center py-10 ${t2}`}
                >

                    <Lock
                        className="w-8 h-8 mx-auto mb-2 opacity-30"
                    />


                    <p className="text-sm font-medium">
                        No authorized documents
                    </p>


                    <p className="text-xs mt-1 px-6">
                        Documents appear here only after a patient
                        grants you explicit access.
                    </p>

                </div>


            ) : (

                /* ==================================================
                    AUTHORIZED DOCUMENT LIST
                ================================================== */

                <div className="space-y-2">

                    {docs.map(doc => (

                        <div
                            key={doc.documentId}

                            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                                dark
                                    ? "border-white/[0.06]"
                                    : "border-gray-200"
                            }`}
                        >

                            {/* ==================================================
                                DOCUMENT INFORMATION
                            ================================================== */}

                            <div
                                className="flex items-center gap-2.5 min-w-0"
                            >

                                <div
                                    className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0"
                                >

                                    <FileText
                                        size={15}
                                        className="text-green-500"
                                    />

                                </div>


                                <div className="min-w-0">

                                    <p
                                        className={`text-xs font-semibold truncate ${tx}`}
                                    >
                                        {doc.fileName}
                                    </p>


                                    <p
                                        className={`text-[10px] ${t2}`}
                                    >

                                        {doc.documentType}

                                        {" · "}

                                        Patient{" "}

                                        {doc.patientId.slice(0, 8)}
                                        …
                                        {doc.patientId.slice(-4)}

                                    </p>

                                </div>

                            </div>


                            {/* ==================================================
                                DOCUMENT ACTIONS
                            ================================================== */}

                            <div
                                className="flex items-center gap-2 shrink-0"
                            >

                                <div
                                    className="text-right"
                                >

                                    <p
                                        className={`text-[10px] font-medium ${t2}`}
                                    >

                                        VIEW · expires{" "}

                                        {formatDate(
                                            doc.expiresAt
                                        )}

                                    </p>


                                    {isExpiringSoon(
                                        doc.expiresAt
                                    ) && (

                                        <p className="text-[9px] text-amber-500">
                                            expiring soon
                                        </p>

                                    )}

                                </div>


                                {/* ==================================================
                                    VIEW BUTTON
                                ================================================== */}

                                <button
                                    onClick={() =>
                                        handleViewDocument(
                                            doc
                                        )
                                    }

                                    title="View authorized document"

                                    className="flex items-center gap-1 text-[10px] font-semibold text-green-500 hover:text-green-400 border border-green-500/30 rounded-lg px-2.5 py-1.5"
                                >

                                    <Eye
                                        size={11}
                                    />

                                    View

                                </button>

                            </div>

                        </div>

                    ))}

                </div>

            )}

        </div>
    );
};


export default DoctorAuthorizedDocuments;