import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
    Users, FileText, CheckCircle, Plus, Eye, Lock,
    Settings, QrCode, ShieldAlert, Search, RefreshCw,
} from '../components/ui/Icons';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import DocumentViewerModal from '../components/DocumentViewerModal';
import SettingsPanel from '../components/SettingsPanel';
import PrescriptionQRPanel from '../components/PrescriptionQRPanel';
import BreakGlassAccess from '../components/BreakGlassAccess';
import { DoctorAccessPanel, Connection } from '../pages/Walletconnect';
import { MedicalRecord, UserRole } from '../types';

const API = "http://localhost:5000";

// ─── Contract config (Foundry/Anvil) ─────────────────────────────────────────
// This address is always the same when deploying to a fresh Anvil instance
// from account 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (Anvil account 0)
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CONTRACT_ABI: string[] = [
    "function addRecord(string memory _cid, string memory _name) public",
    "function setDoctorAccess(address _doctor, bool _status) public",
    "function getRecords(address _patient) public view returns (tuple(string ipfsCid, string fileName, uint256 timestamp, address owner)[])",
    "function authorizedDoctors(address, address) public view returns (bool)",
];

// Anvil Local chain ID
const ANVIL_CHAIN_ID = "0x7a69"; // 31337

// ─── Helper: switch MetaMask to Anvil Local ───────────────────────────────────
async function switchToAnvil() {
    try {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: ANVIL_CHAIN_ID }],
        });
    } catch (switchErr: any) {
        if (switchErr.code === 4902) {
            await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [{
                    chainId: ANVIL_CHAIN_ID,
                    chainName: "Anvil Local",
                    rpcUrls: ["http://127.0.0.1:8545"],
                    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                }],
            });
        } else {
            throw switchErr;
        }
    }
}

type DocTab = 'PATIENTS' | 'PRESCRIPTIONS' | 'EMERGENCY' | 'SETTINGS';

const tx   = (d: boolean) => d ? "text-white"    : "text-gray-900";
const t2   = (d: boolean) => d ? "text-gray-400" : "text-gray-500";
const card = (d: boolean) => d ? "bg-[#0f0f0f] border-white/[0.08]" : "bg-white border-gray-200 shadow-sm";
const dv   = (d: boolean) => d ? "border-white/[0.08]" : "border-gray-100";

const TABS: { id: DocTab; label: string; icon: React.ReactNode }[] = [
    { id: 'PATIENTS',      label: 'Patients',      icon: <Users size={14} /> },
    { id: 'PRESCRIPTIONS', label: 'Prescriptions', icon: <QrCode size={14} /> },
    { id: 'EMERGENCY',     label: 'Emergency',     icon: <ShieldAlert size={14} /> },
    { id: 'SETTINGS',      label: 'Settings',      icon: <Settings size={14} /> },
];

const DoctorDashboard: React.FC = () => {
    const { addToast } = useToast();
    const { theme }    = useTheme();
    const dark         = theme === "dark";

    const [doctorWallet, setDoctorWallet] = useState<string>("");

    useEffect(() => {
        const loadWallet = async () => {
            if (window.ethereum) {
                try {
                    const accounts: string[] = await window.ethereum.request({ method: "eth_accounts" });
                    if (accounts.length > 0) {
                        const w = accounts[0].toLowerCase();
                        setDoctorWallet(w);
                        localStorage.setItem("vault_wallet", w);
                        return;
                    }
                } catch (e) {
                    console.warn("[Doctor] MetaMask read failed:", e);
                }
            }
            const stored = localStorage.getItem("vault_wallet") || "";
            setDoctorWallet(stored.toLowerCase());
        };
        loadWallet();

        if (window.ethereum) {
            const onAccountChange = (accounts: string[]) => {
                if (accounts.length > 0) {
                    const w = accounts[0].toLowerCase();
                    setDoctorWallet(w);
                    localStorage.setItem("vault_wallet", w);
                }
            };
            window.ethereum.on("accountsChanged", onAccountChange);
            return () => window.ethereum?.removeListener?.("accountsChanged", onAccountChange);
        }
    }, []);

    const [activeTab,         setActiveTab]         = useState<DocTab>('PATIENTS');
    const [selectedPatient,   setSelectedPatient]   = useState<{ wallet: string; name: string } | null>(null);
    const [records,           setRecords]           = useState<MedicalRecord[]>([]);
    const [viewingRecord,     setView]              = useState<MedicalRecord | null>(null);
    const [isSyncing,         setIsSyncing]         = useState(false);
    const [search,            setSearch]            = useState('');
    const [showAccessPanel,   setShowAccessPanel]   = useState(false);
    const [connectedPatients, setConnectedPatients] = useState<Connection[]>([]);

    // ── Fetch connected patients from backend ─────────────────────────────────
    const fetchConnectedPatients = useCallback(async () => {
        if (!doctorWallet) return;
        try {
            const res = await fetch(`${API}/connection/doctor/${doctorWallet}`);
            if (!res.ok) return;
            const all: Connection[] = await res.json();
            setConnectedPatients(all.filter(c => c.status === "CONNECTED"));
        } catch (e) {
            console.warn("[Doctor] Could not fetch connections:", e);
        }
    }, [doctorWallet]);

    useEffect(() => {
        if (!doctorWallet) return;
        fetchConnectedPatients();
        const iv = setInterval(fetchConnectedPatients, 2000);
        return () => clearInterval(iv);
    }, [fetchConnectedPatients, doctorWallet]);

    const filteredPatients = connectedPatients.filter(p =>
        (p.patientName || "").toLowerCase().includes(search.toLowerCase()) ||
        p.patientWallet.toLowerCase().includes(search.toLowerCase())
    );

    // ── Backend fallback fetcher ──────────────────────────────────────────────
    const fetchFromBackend = async (walletAddress: string, silent: boolean) => {
        try {
            console.log("[Doctor] Fetching from backend for:", walletAddress);
            const res = await fetch(`${API}/records/patient/${walletAddress.toLowerCase()}`);

            // Check if response is OK and is JSON
            if (!res.ok) {
                throw new Error(`Backend returned ${res.status}`);
            }

            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Backend returned non-JSON response");
            }

            const data = await res.json();

            if (!Array.isArray(data) || data.length === 0) {
                if (!silent) addToast("info", "No records found. Patient has not uploaded any documents yet.");
                setRecords([]);
                return;
            }

            const formatted: MedicalRecord[] = data.map((rec: any) => ({
                id:             rec.id,
                name:           rec.fileName,
                type:           rec.fileType || "PDF",
                date:           rec.uploadedAt ? new Date(rec.uploadedAt).toLocaleDateString("en-IN") : "",
                hash:           rec.fileHash || rec.ipfsCid,
                encryptionType: "ChaCha20-Poly1305" as const,
                ipfsCid:        rec.ipfsCid,
                notarized:      false,
                sharedWith:     [],
                fileUrl:        rec.fileUrl || `https://gateway.pinata.cloud/ipfs/${rec.ipfsCid}`,
                category:       rec.category || "Uploaded",
                size:           rec.fileSize || "",
            }));

            setRecords(formatted);
            addToast(
                silent ? "success" : "warning",
                silent
                    ? `${formatted.length} record(s) loaded.`
                    : `${formatted.length} record(s) from backend (blockchain unavailable).`
            );
        } catch (backendErr: any) {
            console.error("[Doctor] Backend also failed:", backendErr);
            addToast("error", `Could not fetch records: ${backendErr?.message || "Backend unavailable"}`);
        }
    };

    // ── Fetch records: Anvil blockchain primary, backend fallback ─────────────
    const fetchRecords = async (walletAddress: string) => {
        setIsSyncing(true);
        setRecords([]);
        try {
            if (!window.ethereum) throw new Error("MetaMask not found. Please install MetaMask.");

            // Switch to Anvil Local before fetching
            await switchToAnvil();

            const provider = new ethers.BrowserProvider(window.ethereum as any);
            const signer   = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            console.log("[Doctor] Fetching from blockchain for:", walletAddress);
            console.log("[Doctor] Contract address:", CONTRACT_ADDRESS);

            const data = await contract.getRecords(walletAddress);

            if (!data || data.length === 0) {
                addToast("info", "No records on blockchain yet — checking backend…");
                await fetchFromBackend(walletAddress, true);
                return;
            }

            const formatted: MedicalRecord[] = data.map((rec: any, i: number) => ({
                id:             `chain_${i}_${rec.ipfsCid.slice(0, 8)}`,
                name:           rec.fileName,
                type:           rec.fileName?.toLowerCase().endsWith(".pdf") ? "PDF" : "IMAGE",
                date:           new Date(Number(rec.timestamp) * 1000).toLocaleDateString("en-IN"),
                hash:           rec.ipfsCid,
                encryptionType: "ChaCha20-Poly1305" as const,
                ipfsCid:        rec.ipfsCid,
                notarized:      true,
                sharedWith:     [],
                fileUrl:        `https://gateway.pinata.cloud/ipfs/${rec.ipfsCid}`,
            }));

            setRecords(formatted);
            addToast("success", `${formatted.length} record(s) synced from Anvil blockchain ✓`);

        } catch (err: any) {
            console.error("[Doctor] Blockchain fetch failed:", err);

            if (err?.message?.includes("Not authorized")) {
                addToast("error", "Not authorized — patient must grant doctor access on-chain.");
                setIsSyncing(false);
                return;
            } else if (err?.message?.includes("could not decode") || err?.message?.includes("BAD_DATA") || err?.message?.includes("CALL_EXCEPTION")) {
                addToast("warning", "Contract not deployed on Anvil — trying backend fallback…");
            } else if (err?.message?.includes("network") || err?.message?.includes("NETWORK")) {
                addToast("warning", "Wrong MetaMask network — switch to Anvil Local (Chain ID 31337). Trying backend…");
            } else {
                addToast("warning", `Blockchain unavailable — trying backend fallback…`);
            }

            await fetchFromBackend(walletAddress, false);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSelectPatient = (wallet: string, name: string) => {
        setSelectedPatient({ wallet, name });
        setShowAccessPanel(false);
        fetchRecords(wallet);
    };

    return (
        <div className="min-h-screen bg-transparent pt-20 pb-12 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">

                {/* Verified banner */}
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mb-5 flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <div className="flex-1">
                        <span className="text-green-400 text-sm font-semibold">Verified Medical Practitioner · </span>
                        <span className="text-green-500/60 text-sm">License MCI-2023-8821</span>
                    </div>
                    <div className={`flex items-center gap-2 text-[10px] font-mono px-3 py-1.5 rounded-lg ${dark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                        {doctorWallet
                            ? <><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />{doctorWallet.slice(0, 10)}…{doctorWallet.slice(-4)}</>
                            : <><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse inline-block" />Connecting wallet…</>
                        }
                    </div>
                </div>

                {/* Tab bar */}
                <div className={`flex gap-1 border-b mb-6 ${dv(dark)}`}>
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
                                    activeTab === tab.id
                                        ? 'border-green-500 text-green-500'
                                        : dark ? 'border-transparent text-gray-500 hover:text-gray-300'
                                            : 'border-transparent text-gray-400 hover:text-gray-700'
                                }`}>
                            {tab.icon} {tab.label}
                            {tab.id === 'EMERGENCY' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                        </button>
                    ))}
                </div>

                {/* ════ PATIENTS ════ */}
                {activeTab === 'PATIENTS' && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6" style={{ minHeight: '72vh' }}>

                        {/* Patient list */}
                        <div className={`md:col-span-4 border rounded-xl flex flex-col overflow-hidden ${card(dark)}`}>
                            <div className={`p-4 border-b flex-shrink-0 ${dv(dark)}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h2 className={`font-bold ${tx(dark)}`}>Patients</h2>
                                        <p className={`text-[10px] ${t2(dark)}`}>{connectedPatients.length} connected</p>
                                    </div>
                                    <button onClick={() => setShowAccessPanel(s => !s)}
                                            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                                                showAccessPanel
                                                    ? "bg-green-500/10 text-green-500 border-green-500/30"
                                                    : dark ? "border-white/10 text-gray-400 hover:text-white" : "border-gray-200 text-gray-500 hover:text-gray-900"
                                            }`}>
                                        {showAccessPanel ? "← Back" : "+ Requests"}
                                    </button>
                                </div>
                                {!showAccessPanel && (
                                    <div className="relative">
                                        <Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 ${t2(dark)}`} />
                                        <input value={search} onChange={e => setSearch(e.target.value)}
                                               placeholder="Search patients…"
                                               className={`w-full border rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-green-500 transition-colors ${
                                                   dark ? "bg-black/50 border-white/10 text-white placeholder-gray-600"
                                                       : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"
                                               }`} />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto">
                                {showAccessPanel ? (
                                    <div className="p-4">
                                        {doctorWallet ? (
                                            <DoctorAccessPanel
                                                doctorWallet={doctorWallet}
                                                doctorName="Dr. Sunita Mehta"
                                                dark={dark}
                                                onViewPatient={(wallet, name) => {
                                                    handleSelectPatient(wallet, name);
                                                    fetchConnectedPatients();
                                                }}
                                            />
                                        ) : (
                                            <div className={`text-center py-8 ${t2(dark)}`}>
                                                <RefreshCw size={20} className="mx-auto mb-2 animate-spin" />
                                                <p className="text-xs">Loading wallet…</p>
                                            </div>
                                        )}
                                    </div>
                                ) : filteredPatients.length === 0 ? (
                                    <div className={`text-center py-14 ${t2(dark)}`}>
                                        <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                        <p className="text-sm font-medium">No connected patients</p>
                                        <p className="text-xs mt-1 px-4">Accept patient requests using the "+ Requests" button</p>
                                        <button onClick={() => setShowAccessPanel(true)}
                                                className="mt-3 text-xs text-green-500 border border-green-500/20 px-3 py-1.5 rounded-lg">
                                            View requests →
                                        </button>
                                    </div>
                                ) : (
                                    filteredPatients.map(p => (
                                        <div key={p.id}
                                             onClick={() => handleSelectPatient(p.patientWallet, p.patientName)}
                                             className={`p-4 border-b cursor-pointer transition-all ${dv(dark)} ${
                                                 selectedPatient?.wallet === p.patientWallet
                                                     ? 'bg-green-500/10 border-l-4 border-l-green-500'
                                                     : dark ? 'hover:bg-white/[0.02] border-l-4 border-l-transparent'
                                                         : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                                             }`}>
                                            <div className="flex items-center gap-2">
                                                <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center text-sm font-bold text-green-500 flex-shrink-0">
                                                    {(p.patientName || "P")[0].toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className={`text-sm font-semibold truncate ${tx(dark)}`}>{p.patientName || "Patient"}</h3>
                                                    <p className={`text-[10px] font-mono truncate ${t2(dark)}`}>{p.patientWallet}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Records panel */}
                        <div className={`md:col-span-8 border rounded-xl flex flex-col overflow-hidden ${card(dark)}`}>
                            {selectedPatient ? (
                                <>
                                    <div className={`p-5 border-b flex items-center justify-between flex-shrink-0 ${dv(dark)}`}>
                                        <div>
                                            <h2 className={`font-bold ${tx(dark)}`}>{selectedPatient.name}</h2>
                                            <p className={`text-[10px] font-mono ${t2(dark)}`}>{selectedPatient.wallet}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => fetchRecords(selectedPatient.wallet)} disabled={isSyncing}
                                                    className={`flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 ${
                                                        dark ? "border-white/10 text-gray-400 hover:text-white" : "border-gray-200 text-gray-500 hover:text-gray-900"
                                                    }`}>
                                                <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
                                                {isSyncing ? "Syncing…" : "Sync records"}
                                            </button>
                                            <button onClick={() => setActiveTab('PRESCRIPTIONS')}
                                                    className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
                                                <Plus size={13} /> Prescription
                                            </button>
                                        </div>
                                    </div>

                                    {isSyncing ? (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="text-center">
                                                <RefreshCw size={28} className="text-green-500 animate-spin mx-auto mb-3" />
                                                <p className={`text-sm ${t2(dark)}`}>Syncing records…</p>
                                                <p className={`text-xs mt-1 ${t2(dark)}`}>Trying blockchain, then backend fallback</p>
                                            </div>
                                        </div>
                                    ) : records.length > 0 ? (
                                        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
                                            {records.map(rec => (
                                                <div key={rec.id} className={`border p-4 rounded-xl flex items-center justify-between transition-all hover:border-green-500/40 ${card(dark)}`}>
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                                                            <FileText size={16} className="text-green-500" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className={`text-sm font-medium truncate ${tx(dark)}`}>{rec.name}</p>
                                                            <p className={`text-[10px] ${t2(dark)}`}>{rec.date} · {rec.type}</p>
                                                            {rec.notarized
                                                                ? <p className="text-[10px] text-green-500 font-semibold">✓ On-chain (Anvil)</p>
                                                                : <p className={`text-[10px] ${t2(dark)}`}>📦 Backend stored</p>
                                                            }
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <Lock size={12} className="text-green-500" />
                                                        <button onClick={() => setView(rec)}
                                                                className={`transition-colors ${dark ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-900"}`}>
                                                            <Eye size={16} />
                                                        </button>
                                                        {rec.fileUrl && (
                                                            <a href={rec.fileUrl} target="_blank" rel="noreferrer"
                                                               className="text-gray-400 hover:text-sky-500 transition-colors">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className={`flex-1 flex flex-col items-center justify-center ${t2(dark)}`}>
                                            <FileText className="w-12 h-12 mb-3 opacity-10" />
                                            <p className="text-sm font-medium">No records found.</p>
                                            <p className="text-xs mt-1">Click "Sync records" to fetch.</p>
                                            <div className={`mt-4 p-3 rounded-xl border text-xs text-center max-w-sm ${dark ? "border-white/10 bg-white/5" : "border-gray-200 bg-gray-50"}`}>
                                                <p className={`font-semibold mb-2 ${tx(dark)}`}>Make sure Anvil is running:</p>
                                                <code className={`text-[10px] block mb-1 ${t2(dark)}`}>.\anvil.exe</code>
                                                <p className={`font-semibold mb-2 mt-2 ${tx(dark)}`}>Then redeploy contract:</p>
                                                <code className={`text-[10px] block ${t2(dark)}`}>.\forge.exe create contracts/MedicalVault.sol:MedicalVault --rpc-url http://127.0.0.1:8545 --private-key 0xac09...ff80 --broadcast</code>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className={`flex-1 flex flex-col items-center justify-center ${t2(dark)}`}>
                                    <Users className="h-16 w-16 mb-4 opacity-10" />
                                    <p className="text-sm font-medium">No patient selected</p>
                                    <p className="text-xs mt-1">Select a connected patient from the list.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'PRESCRIPTIONS' && (
                    <div className={`border rounded-xl p-6 ${card(dark)}`}>
                        <React.Suspense fallback={<div className={`text-center py-12 ${t2(dark)}`}>Loading…</div>}>
                            <PrescriptionQRPanel
                                role="DOCTOR"
                                patientWallet={selectedPatient?.wallet || ""}
                                doctorWallet={doctorWallet}
                                doctorName="Dr. Sunita Mehta"
                            />
                        </React.Suspense>
                    </div>
                )}

                {activeTab === 'EMERGENCY' && (
                    <div className={`border rounded-xl p-6 ${card(dark)}`}>
                        {selectedPatient
                            ? <BreakGlassAccess patientWallet={selectedPatient.wallet} />
                            : <div className={`text-center py-16 ${t2(dark)}`}>
                                <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">Select a patient first</p>
                                <button onClick={() => setActiveTab('PATIENTS')} className="mt-3 text-xs text-sky-500">→ Go to Patients</button>
                            </div>
                        }
                    </div>
                )}

                {activeTab === 'SETTINGS' && (
                    <div className={`border rounded-xl overflow-hidden ${card(dark)}`} style={{ minHeight: 600 }}>
                        <React.Suspense fallback={null}>
                            <SettingsPanel role={UserRole.DOCTOR} walletAddress={doctorWallet} />
                        </React.Suspense>
                    </div>
                )}
            </div>

            <DocumentViewerModal isOpen={!!viewingRecord} onClose={() => setView(null)} record={viewingRecord} />
        </div>
    );
};

export default DoctorDashboard;