import React, { useState, useEffect } from 'react';
import {
    Users,
    FileText,
    CheckCircle,
    Plus,
    Eye,
    Lock,
    Settings,
    QrCode,
    ShieldAlert,
    Search,
    RefreshCw,
} from '../components/ui/Icons';

import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { API_BASE_URL } from '../services/apiConfig';

import DocumentViewerModal from '../components/DocumentViewerModal';
import SettingsPanel from '../components/SettingsPanel';
import PrescriptionQRPanel from '../components/PrescriptionQRPanel';
import BreakGlassAccess from '../components/BreakGlassAccess';
import DoctorAuthorizedDocuments from '../components/DoctorAuthorizedDocuments';
import NotificationBell from '../components/ui/NotificationBell';

import { DoctorAccessPanel, Connection } from './Walletconnect';

import { listMedicalRecords } from '../services/ipfsService';

import { MedicalRecord, UserRole } from '../types';


type DocTab =
    | 'PATIENTS'
    | 'PRESCRIPTIONS'
    | 'EMERGENCY'
    | 'SETTINGS';


const tx = (d: boolean) =>
    d ? "text-white" : "text-gray-900";

const t2 = (d: boolean) =>
    d ? "text-gray-400" : "text-gray-500";

const card = (d: boolean) =>
    d
        ? "bg-[#0f0f0f] border-white/[0.08]"
        : "bg-white border-gray-200 shadow-sm";

const dv = (d: boolean) =>
    d
        ? "border-white/[0.08]"
        : "border-gray-100";


const TABS: {
    id: DocTab;
    label: string;
    icon: React.ReactNode;
}[] = [
    {
        id: 'PATIENTS',
        label: 'Patients',
        icon: <Users size={14} />,
    },
    {
        id: 'PRESCRIPTIONS',
        label: 'Prescriptions',
        icon: <QrCode size={14} />,
    },
    {
        id: 'EMERGENCY',
        label: 'Emergency',
        icon: <ShieldAlert size={14} />,
    },
    {
        id: 'SETTINGS',
        label: 'Settings',
        icon: <Settings size={14} />,
    },
];


const DoctorDashboard: React.FC = () => {

    const { addToast } = useToast();

    const { theme } = useTheme();

    const dark = theme === "dark";


    // ============================================================
    // DOCTOR WALLET
    // ============================================================

    const [doctorWallet, setDoctorWallet] = useState<string>("");


    useEffect(() => {

        const loadWallet = async () => {

            // Priority 1:
            // Read directly from MetaMask
            if (window.ethereum) {

                try {

                    const accounts: string[] =
                        await window.ethereum.request({
                            method: "eth_accounts",
                        });

                    if (accounts.length > 0) {

                        const wallet =
                            accounts[0].toLowerCase();

                        setDoctorWallet(wallet);

                        localStorage.setItem(
                            "vault_wallet",
                            wallet
                        );

                        console.log(
                            "[Doctor] Wallet from MetaMask:",
                            wallet
                        );

                        return;
                    }

                } catch (error) {

                    console.warn(
                        "[Doctor] MetaMask read failed:",
                        error
                    );
                }
            }


            // Priority 2:
            // localStorage fallback
            const stored =
                localStorage.getItem("vault_wallet") || "";

            setDoctorWallet(
                stored.toLowerCase()
            );

            console.log(
                "[Doctor] Wallet from localStorage:",
                stored
            );
        };


        loadWallet();


        // Listen for MetaMask account changes
        if (window.ethereum) {

            const onAccountChange = (
                accounts: string[]
            ) => {

                if (accounts.length > 0) {

                    const wallet =
                        accounts[0].toLowerCase();

                    setDoctorWallet(wallet);

                    localStorage.setItem(
                        "vault_wallet",
                        wallet
                    );
                }
            };


            window.ethereum.on(
                "accountsChanged",
                onAccountChange
            );


            return () =>
                window.ethereum?.removeListener?.(
                    "accountsChanged",
                    onAccountChange
                );
        }

    }, []);


    // ============================================================
    // STATE
    // ============================================================

    const [activeTab, setActiveTab] =
        useState<DocTab>('PATIENTS');


    const [selectedPatient, setSelectedPatient] =
        useState<{
            wallet: string;
            name: string;
        } | null>(null);


    const [records, setRecords] =
        useState<MedicalRecord[]>([]);


    // Document currently opened in viewer
    const [viewingRecord, setView] =
        useState<MedicalRecord | null>(null);


    const [isSyncing, setIsSyncing] =
        useState(false);


    const [search, setSearch] =
        useState('');


    const [showAccessPanel, setShowAccessPanel] =
        useState(false);


    const [connectedPatients, setConnectedPatients] =
        useState<Connection[]>([]);


    // ============================================================
    // REFRESH CONNECTED PATIENTS
    // ============================================================

    useEffect(() => {

        if (!doctorWallet) return;


        let cancelled = false;


        const refresh = async () => {

            try {

                const response = await fetch(
                    `${API_BASE_URL}/connection/doctor/${doctorWallet.toLowerCase()}`
                );


                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}`
                    );
                }


                const all: Connection[] =
                    await response.json();


                if (cancelled) return;


                const connected =
                    all.filter(
                        connection =>
                            connection.status === "CONNECTED"
                    );


                setConnectedPatients(
                    connected
                );


                console.log(
                    "[Doctor] Backend connections:",
                    doctorWallet,
                    "total:",
                    all.length,
                    "connected:",
                    connected.length
                );

            } catch (error) {

                console.error(
                    "[Doctor] Failed to load connections:",
                    error
                );


                if (!cancelled) {
                    setConnectedPatients([]);
                }
            }
        };


        refresh();


        const interval =
            setInterval(
                refresh,
                2000
            );


        return () => {

            cancelled = true;

            clearInterval(interval);
        };

    }, [doctorWallet]);


    // ============================================================
    // FILTER PATIENTS
    // ============================================================

    const filteredPatients =
        connectedPatients.filter(
            patient =>
                (patient.patientName || "")
                    .toLowerCase()
                    .includes(search.toLowerCase())
                ||
                patient.patientWallet
                    .toLowerCase()
                    .includes(search.toLowerCase())
        );


    // ============================================================
    // FILE TYPE
    // ============================================================

    const inferFileType = (
        mimeType: string
    ): MedicalRecord['type'] => {

        if (
            mimeType?.startsWith('image/')
        ) {
            return 'IMAGE';
        }


        if (
            mimeType === 'application/pdf'
        ) {
            return 'PDF';
        }


        return 'PDF';
    };


    // ============================================================
    // SYNC PATIENT RECORDS
    // ============================================================

    const fetchRecords = async (
        walletAddress: string
    ) => {

        if (!doctorWallet) {

            addToast(
                'error',
                'Connecting wallet — try again in a moment.'
            );

            return;
        }


        setIsSyncing(true);

        setRecords([]);


        try {

            const data =
                await listMedicalRecords(
                    walletAddress,
                    doctorWallet
                );


            const formatted: MedicalRecord[] =
                data.map(rec => ({

                    id: rec.recordId,

                    backendRecordId:
                    rec.recordId,

                    name:
                    rec.original.name,

                    type:
                        inferFileType(
                            rec.original.mimeType
                        ),

                    date:
                        new Date(
                            rec.createdAt
                        ).toLocaleDateString(),

                    hash:
                    rec.ciphertextSha256,

                    ipfsCid:
                    rec.cid,

                    notarized:
                        true,

                    sharedWith:
                        [],

                    encryptionType:
                        'AES-GCM',

                }));


            setRecords(formatted);


            // This toast is ONLY for an explicit
            // "Sync records" action.
            addToast(
                'success',
                `${formatted.length} record(s) synced.`
            );

        } catch (err: any) {

            addToast(
                'error',
                err?.message ||
                'Could not fetch records.'
            );


            console.error(
                '[Doctor] fetchRecords error:',
                err
            );

        } finally {

            setIsSyncing(false);
        }
    };


    // ============================================================
    // SELECT PATIENT
    // ============================================================

    const handleSelectPatient = (
        wallet: string,
        name: string
    ) => {

        setSelectedPatient({
            wallet,
            name,
        });


        setShowAccessPanel(false);


        fetchRecords(wallet);
    };


    // ============================================================
    // NEW:
    // VIEW ONE AUTHORIZED DOCUMENT
    //
    // IMPORTANT:
    // This does NOT call fetchRecords()
    // Therefore it does NOT show:
    //
    // "2 record(s) synced."
    //
    // It only loads the selected document
    // and opens DocumentViewerModal.
    // ============================================================

    const handleViewAuthorizedDocument = async (
        patientWallet: string,
        documentId: string
    ) => {

        if (!doctorWallet) {

            addToast(
                'error',
                'Connecting wallet — try again in a moment.'
            );

            return;
        }


        try {

            /*
             * listMedicalRecords() already uses the
             * doctor wallet as requester.
             *
             * The backend/Fabric access-control layer
             * therefore determines which documents this
             * doctor is actually allowed to retrieve.
             */
            const data =
                await listMedicalRecords(
                    patientWallet,
                    doctorWallet
                );


            /*
             * Find ONLY the requested document.
             */
            const rec =
                data.find(
                    item =>
                        item.recordId === documentId
                );


            /*
             * Document is no longer accessible.
             *
             * This can happen if:
             * - Patient revoked access
             * - Permission expired
             * - Document was removed
             * - Document ID is invalid
             */
            if (!rec) {

                addToast(
                    'error',
                    'This document is no longer available or your access has expired.'
                );

                return;
            }


            /*
             * Convert backend record into
             * MedicalRecord expected by
             * DocumentViewerModal.
             */
            const record: MedicalRecord = {

                id:
                rec.recordId,

                backendRecordId:
                rec.recordId,

                name:
                rec.original.name,

                type:
                    inferFileType(
                        rec.original.mimeType
                    ),

                date:
                    new Date(
                        rec.createdAt
                    ).toLocaleDateString(),

                hash:
                rec.ciphertextSha256,

                ipfsCid:
                rec.cid,

                notarized:
                    true,

                sharedWith:
                    [],

                encryptionType:
                    'AES-GCM',
            };


            /*
             * OPEN DOCUMENT VIEWER
             *
             * No records state update.
             * No sync operation.
             * No "record(s) synced" toast.
             */
            setView(record);

        } catch (err: any) {

            console.error(
                '[Doctor] View authorized document error:',
                err
            );


            addToast(
                'error',
                err?.message ||
                'Could not open the authorized document.'
            );
        }
    };


    // ============================================================
    // RENDER
    // ============================================================

    return (

        <div className="min-h-screen bg-transparent pt-20 pb-12 px-4 sm:px-6">

            <div className="max-w-7xl mx-auto">


                {/* ==================================================
                    VERIFIED DOCTOR BANNER
                ================================================== */}

                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mb-5 flex items-center gap-3">

                    <CheckCircle
                        className="h-4 w-4 text-green-500 flex-shrink-0"
                    />


                    <div className="flex-1">

                        <span className="text-green-400 text-sm font-semibold">
                            Verified Medical Practitioner ·
                        </span>


                        <span className="text-green-500/60 text-sm">
                            {' '}License MCI-2023-8821
                        </span>

                    </div>


                    <NotificationBell wallet={doctorWallet} dark={dark} />

                    <div
                        className={`flex items-center gap-2 text-[10px] font-mono px-3 py-1.5 rounded-lg ${
                            dark
                                ? "bg-white/5 text-gray-400"
                                : "bg-gray-100 text-gray-500"
                        }`}
                    >

                        {doctorWallet ? (

                            <>
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />

                                {doctorWallet.slice(0, 10)}
                                …
                                {doctorWallet.slice(-4)}
                            </>

                        ) : (

                            <>
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse inline-block" />

                                Connecting wallet…
                            </>

                        )}

                    </div>

                </div>


                {/* ==================================================
                    TAB BAR
                ================================================== */}

                <div
                    className={`flex gap-1 border-b mb-6 ${dv(dark)}`}
                >

                    {TABS.map(tab => (

                        <button
                            key={tab.id}
                            onClick={() =>
                                setActiveTab(tab.id)
                            }

                            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
                                activeTab === tab.id
                                    ? 'border-green-500 text-green-500'
                                    : dark
                                        ? 'border-transparent text-gray-500 hover:text-gray-300'
                                        : 'border-transparent text-gray-400 hover:text-gray-700'
                            }`}
                        >

                            {tab.icon}

                            {tab.label}


                            {tab.id === 'EMERGENCY' && (

                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />

                            )}

                        </button>

                    ))}

                </div>


                {/* ==================================================
                    PATIENTS
                ================================================== */}

                {activeTab === 'PATIENTS' && (

                    <div className="space-y-6">


                        {/* ==================================================
                            AUTHORIZED DOCUMENTS
                        ================================================== */}

                        {doctorWallet && (

                            <DoctorAuthorizedDocuments
                                doctorWallet={doctorWallet}
                                onSelectPatient={
                                    handleSelectPatient
                                }

                                /*
                                 * IMPORTANT:
                                 *
                                 * Your DoctorAuthorizedDocuments component
                                 * needs to accept this callback and call it
                                 * from its "View" button.
                                 */
                                onViewDocument={
                                    handleViewAuthorizedDocument
                                }
                            />

                        )}


                        <div
                            className="grid grid-cols-1 md:grid-cols-12 gap-6"
                            style={{
                                minHeight: '72vh'
                            }}
                        >


                            {/* ==================================================
                                PATIENT LIST
                            ================================================== */}

                            <div
                                className={`md:col-span-4 border rounded-xl flex flex-col overflow-hidden ${card(dark)}`}
                            >

                                <div
                                    className={`p-4 border-b flex-shrink-0 ${dv(dark)}`}
                                >

                                    <div className="flex items-center justify-between mb-3">

                                        <div>

                                            <h2
                                                className={`font-bold ${tx(dark)}`}
                                            >
                                                Patients
                                            </h2>


                                            <p
                                                className={`text-[10px] ${t2(dark)}`}
                                            >
                                                {connectedPatients.length}
                                                {' '}connected
                                            </p>

                                        </div>


                                        <button
                                            onClick={() =>
                                                setShowAccessPanel(
                                                    s => !s
                                                )
                                            }

                                            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                                                showAccessPanel
                                                    ? "bg-green-500/10 text-green-500 border-green-500/30"
                                                    : dark
                                                        ? "border-white/10 text-gray-400 hover:text-white"
                                                        : "border-gray-200 text-gray-500 hover:text-gray-900"
                                            }`}
                                        >

                                            {
                                                showAccessPanel
                                                    ? "← Back"
                                                    : "+ Requests"
                                            }

                                        </button>

                                    </div>


                                    {!showAccessPanel && (

                                        <div className="relative">

                                            <Search
                                                size={13}
                                                className={`absolute left-3 top-1/2 -translate-y-1/2 ${t2(dark)}`}
                                            />


                                            <input
                                                value={search}
                                                onChange={e =>
                                                    setSearch(
                                                        e.target.value
                                                    )
                                                }

                                                placeholder="Search patients…"

                                                className={`w-full border rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-green-500 transition-colors ${
                                                    dark
                                                        ? "bg-black/50 border-white/10 text-white placeholder-gray-600"
                                                        : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"
                                                }`}
                                            />

                                        </div>

                                    )}

                                </div>


                                <div className="flex-1 overflow-y-auto">

                                    {showAccessPanel ? (

                                        /* ==================================================
                                           ACCESS REQUESTS
                                        ================================================== */

                                        <div className="p-4">

                                            {doctorWallet ? (

                                                <DoctorAccessPanel
                                                    doctorWallet={
                                                        doctorWallet
                                                    }

                                                    doctorName="Dr. Sunita Mehta"

                                                    dark={dark}

                                                    onViewPatient={
                                                        handleSelectPatient
                                                    }
                                                />

                                            ) : (

                                                <div
                                                    className={`text-center py-8 ${t2(dark)}`}
                                                >

                                                    <RefreshCw
                                                        size={20}
                                                        className="mx-auto mb-2 animate-spin"
                                                    />

                                                    <p className="text-xs">
                                                        Loading wallet…
                                                    </p>

                                                </div>

                                            )}

                                        </div>

                                    ) : filteredPatients.length === 0 ? (

                                        /* ==================================================
                                           NO PATIENTS
                                        ================================================== */

                                        <div
                                            className={`text-center py-14 ${t2(dark)}`}
                                        >

                                            <Users
                                                className="w-10 h-10 mx-auto mb-3 opacity-20"
                                            />


                                            <p className="text-sm font-medium">
                                                No connected patients
                                            </p>


                                            <p className="text-xs mt-1 px-4">
                                                Accept patient requests using the "+ Requests" button
                                            </p>


                                            <button
                                                onClick={() =>
                                                    setShowAccessPanel(true)
                                                }

                                                className="mt-3 text-xs text-green-500 hover:text-green-400 border border-green-500/20 px-3 py-1.5 rounded-lg"
                                            >
                                                View requests →
                                            </button>

                                        </div>

                                    ) : (

                                        /* ==================================================
                                           PATIENT LIST
                                        ================================================== */

                                        filteredPatients.map(p => (

                                            <div
                                                key={p.id}

                                                onClick={() =>
                                                    handleSelectPatient(
                                                        p.patientWallet,
                                                        p.patientName
                                                    )
                                                }

                                                className={`p-4 border-b cursor-pointer transition-all ${dv(dark)} ${
                                                    selectedPatient?.wallet?.toLowerCase() === p.patientWallet?.toLowerCase()
                                                        ? 'bg-green-500/10 border-l-4 border-l-green-500'
                                                        : dark
                                                            ? 'hover:bg-white/[0.02] border-l-4 border-l-transparent'
                                                            : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                                                }`}
                                            >

                                                <div className="flex items-center gap-2">

                                                    <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center text-sm font-bold text-green-500 flex-shrink-0">

                                                        {(p.patientName || "P")[0].toUpperCase()}

                                                    </div>


                                                    <div className="min-w-0">

                                                        <h3
                                                            className={`text-sm font-semibold truncate ${tx(dark)}`}
                                                        >
                                                            {p.patientName || "Patient"}
                                                        </h3>


                                                        <p
                                                            className={`text-[10px] font-mono truncate ${t2(dark)}`}
                                                        >
                                                            {p.patientWallet}
                                                        </p>

                                                    </div>

                                                </div>

                                            </div>

                                        ))

                                    )}

                                </div>

                            </div>


                            {/* ==================================================
                                RECORDS PANEL
                            ================================================== */}

                            <div
                                className={`md:col-span-8 border rounded-xl flex flex-col overflow-hidden ${card(dark)}`}
                            >

                                {selectedPatient ? (

                                    <>

                                        <div
                                            className={`p-5 border-b flex items-center justify-between flex-shrink-0 ${dv(dark)}`}
                                        >

                                            <div>

                                                <h2
                                                    className={`font-bold ${tx(dark)}`}
                                                >
                                                    {selectedPatient.name}
                                                </h2>


                                                <p
                                                    className={`text-[10px] font-mono ${t2(dark)}`}
                                                >
                                                    {selectedPatient.wallet}
                                                </p>

                                            </div>


                                            <div className="flex gap-2">

                                                {/* ==================================================
                                                    EXPLICIT SYNC BUTTON
                                                ================================================== */}

                                                <button
                                                    onClick={() =>
                                                        fetchRecords(
                                                            selectedPatient.wallet
                                                        )
                                                    }

                                                    disabled={isSyncing}

                                                    className={`flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg transition-all ${
                                                        dark
                                                            ? "border-white/10 text-gray-400 hover:text-white"
                                                            : "border-gray-200 text-gray-500 hover:text-gray-900"
                                                    }`}
                                                >

                                                    <RefreshCw
                                                        size={12}
                                                        className={
                                                            isSyncing
                                                                ? "animate-spin"
                                                                : ""
                                                        }
                                                    />


                                                    {
                                                        isSyncing
                                                            ? "Syncing…"
                                                            : "Sync records"
                                                    }

                                                </button>


                                                {/* ==================================================
                                                    PRESCRIPTION
                                                ================================================== */}

                                                <button
                                                    onClick={() =>
                                                        setActiveTab(
                                                            'PRESCRIPTIONS'
                                                        )
                                                    }

                                                    className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                                >

                                                    <Plus size={13} />

                                                    Prescription

                                                </button>

                                            </div>

                                        </div>


                                        {/* ==================================================
                                            SYNCING
                                        ================================================== */}

                                        {isSyncing ? (

                                            <div className="flex-1 flex items-center justify-center">

                                                <div className="text-center">

                                                    <RefreshCw
                                                        size={28}
                                                        className="text-green-500 animate-spin mx-auto mb-3"
                                                    />


                                                    <p
                                                        className={`text-sm ${t2(dark)}`}
                                                    >
                                                        Syncing from blockchain…
                                                    </p>

                                                </div>

                                            </div>

                                        ) : records.length > 0 ? (

                                            /* ==================================================
                                               RECORDS
                                            ================================================== */

                                            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-2 gap-3">

                                                {records.map(rec => (

                                                    <div
                                                        key={rec.id}

                                                        className={`border p-4 rounded-xl flex items-center justify-between transition-all hover:border-green-500/40 ${card(dark)}`}
                                                    >

                                                        <div className="flex items-center gap-3">

                                                            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">

                                                                <FileText
                                                                    size={16}
                                                                    className="text-green-500"
                                                                />

                                                            </div>


                                                            <div>

                                                                <p
                                                                    className={`text-sm font-medium ${tx(dark)}`}
                                                                >
                                                                    {rec.name}
                                                                </p>


                                                                <p
                                                                    className={`text-[10px] ${t2(dark)}`}
                                                                >
                                                                    {rec.date}
                                                                    {' · '}
                                                                    {rec.type}
                                                                </p>

                                                            </div>

                                                        </div>


                                                        <div className="flex items-center gap-2">

                                                            <Lock
                                                                size={12}
                                                                className="text-green-500"
                                                            />


                                                            {/* ==================================================
                                                                VIEW RECORD
                                                            ================================================== */}

                                                            <button
                                                                onClick={() =>
                                                                    setView(rec)
                                                                }

                                                                title="View document"

                                                                className={`transition-colors ${
                                                                    dark
                                                                        ? "text-gray-500 hover:text-white"
                                                                        : "text-gray-400 hover:text-gray-900"
                                                                }`}
                                                            >

                                                                <Eye size={16} />

                                                            </button>

                                                        </div>

                                                    </div>

                                                ))}

                                            </div>

                                        ) : (

                                            /* ==================================================
                                               NO RECORDS
                                            ================================================== */

                                            <div
                                                className={`flex-1 flex flex-col items-center justify-center ${t2(dark)}`}
                                            >

                                                <FileText
                                                    className="w-12 h-12 mb-3 opacity-10"
                                                />


                                                <p className="text-sm">
                                                    No records found.
                                                </p>


                                                <p className="text-xs mt-1">
                                                    Click "Sync records" to fetch from blockchain.
                                                </p>

                                            </div>

                                        )}

                                    </>

                                ) : (

                                    /* ==================================================
                                       NO PATIENT SELECTED
                                    ================================================== */

                                    <div
                                        className={`flex-1 flex flex-col items-center justify-center ${t2(dark)}`}
                                    >

                                        <Users
                                            className="h-16 w-16 mb-4 opacity-10"
                                        />


                                        <p className="text-sm font-medium">
                                            No patient selected
                                        </p>


                                        <p className="text-xs mt-1">
                                            Select a connected patient from the list.
                                        </p>

                                    </div>

                                )}

                            </div>

                        </div>

                    </div>

                )}


                {/* ==================================================
                    PRESCRIPTIONS
                ================================================== */}

                {activeTab === 'PRESCRIPTIONS' && (
                    <div className={`border rounded-xl p-6 ${card(dark)}`}>

                        {/* Patient selector for this tab */}
                        <div className="mb-5 flex items-center gap-3">
                            <label className={`text-xs font-medium ${t2(dark)}`}>
                                Patient:
                            </label>

                            <div className="mb-5">
                                <label className={`block text-xs font-medium mb-2 ${t2(dark)}`}>
                                    Prescription for patient
                                </label>

                                <select
                                    value={selectedPatient?.wallet || ''}
                                    onChange={(e) => {
                                        const wallet = e.target.value;

                                        if (!wallet) {
                                            setSelectedPatient(null);
                                            return;
                                        }

                                        const patient = connectedPatients.find(
                                            p =>
                                                p.patientWallet?.toLowerCase() ===
                                                wallet.toLowerCase()
                                        );

                                        if (patient) {
                                            setSelectedPatient({
                                                wallet: patient.patientWallet,
                                                name: patient.patientName || 'Patient',
                                            });
                                        } else {
                                            setSelectedPatient(null);
                                        }
                                    }}
                                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-green-500 ${
                                        dark
                                            ? "bg-black/50 border-white/10 text-white"
                                            : "bg-gray-50 border-gray-200 text-gray-900"
                                    }`}
                                >
                                    <option value="">
                                        Select a connected patient
                                    </option>

                                    {connectedPatients.map(patient => (
                                        <option
                                            key={patient.patientWallet}
                                            value={patient.patientWallet}
                                        >
                                            {patient.patientName || 'Patient'} — {patient.patientWallet}
                                        </option>
                                    ))}
                                </select>

                                {selectedPatient && (
                                    <div
                                        className={`mt-2 px-3 py-2 rounded-lg text-xs font-mono ${
                                            dark
                                                ? "bg-green-500/5 border border-green-500/10 text-green-400"
                                                : "bg-green-50 border border-green-200 text-green-600"
                                        }`}
                                    >
                                        Selected wallet: {selectedPatient.wallet}
                                    </div>
                                )}
                            </div>
                        </div>

                        <React.Suspense fallback={<div className={`text-center py-12 ${t2(dark)}`}>Loading…</div>}>
                            <PrescriptionQRPanel
                                role="DOCTOR"
                                doctorWallet={doctorWallet}
                                patientWallet={selectedPatient?.wallet}
                            />
                        </React.Suspense>
                    </div>
                )}

                {/* ==================================================
                    EMERGENCY
                ================================================== */}

                {activeTab === 'EMERGENCY' && (

                    <div
                        className={`border rounded-xl p-6 ${card(dark)}`}
                    >

                        {selectedPatient ? (

                            <BreakGlassAccess
                                patientWallet={
                                    selectedPatient.wallet
                                }
                            />

                        ) : (

                            <div
                                className={`text-center py-16 ${t2(dark)}`}
                            >

                                <ShieldAlert
                                    className="w-12 h-12 mx-auto mb-3 opacity-20"
                                />


                                <p className="text-sm font-medium">
                                    Select a patient first
                                </p>


                                <button
                                    onClick={() =>
                                        setActiveTab(
                                            'PATIENTS'
                                        )
                                    }

                                    className="mt-3 text-xs text-sky-500"
                                >
                                    → Go to Patients
                                </button>

                            </div>

                        )}

                    </div>

                )}


                {/* ==================================================
                    SETTINGS
                ================================================== */}

                {activeTab === 'SETTINGS' && (

                    <div
                        className={`border rounded-xl overflow-hidden ${card(dark)}`}
                        style={{
                            minHeight: 600
                        }}
                    >

                        <React.Suspense
                            fallback={null}
                        >

                            <SettingsPanel
                                role={UserRole.DOCTOR}
                                walletAddress={
                                    doctorWallet
                                }
                            />

                        </React.Suspense>

                    </div>

                )}

            </div>


            {/* ==================================================
                DOCUMENT VIEWER
            ================================================== */}

            <DocumentViewerModal
                isOpen={
                    !!viewingRecord
                }

                onClose={() =>
                    setView(null)
                }

                record={
                    viewingRecord
                }

                requesterWallet={
                    doctorWallet
                }
            />

        </div>
    );
};


export default DoctorDashboard;
