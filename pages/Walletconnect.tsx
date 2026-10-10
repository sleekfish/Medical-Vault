import React, { useState, useEffect, useCallback } from "react";
import { useToast } from "../context/ToastContext";
import { API_BASE_URL } from "../services/apiConfig";

const API = API_BASE_URL;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Connection {
    id:            string;
    patientWallet: string;
    doctorWallet:  string;
    patientName:   string;
    doctorName:    string;
    status:        "PENDING" | "CONNECTED" | "REJECTED" | "REVOKED";
    requestedAt:   string;
    connectedAt:   string | null;
    txHash:        string | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiRequest(url: string, body?: object): Promise<any> {
    const res = await fetch(url, body ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    } : { method: "GET" });

    if (!res.ok) {
        let detail = "";
        try { const d = await res.json(); detail = d.error || JSON.stringify(d); } catch {}
        console.error(`[API] ${body ? "POST" : "GET"} ${url} → ${res.status}: ${detail}`);
        throw new Error(`HTTP ${res.status}: ${detail}`);
    }
    return res.json();
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
    tx:   (d: boolean) => d ? "text-white"    : "text-gray-900",
    t2:   (d: boolean) => d ? "text-gray-400" : "text-gray-500",
    card: (d: boolean) => d ? "bg-[#111] border-white/10" : "bg-white border-gray-200 shadow-sm",
    inp:  (d: boolean) => d
        ? "bg-black/60 border-white/10 text-white placeholder-gray-600 focus:border-sky-500"
        : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-sky-500",
    dv:   (d: boolean) => d ? "border-white/[0.07]" : "border-gray-100",
};

const StatusBadge: React.FC<{ status: Connection["status"] }> = ({ status }) => {
    const map: Record<string, string> = {
        PENDING:   "text-yellow-600 bg-yellow-50 border-yellow-200",
        CONNECTED: "text-green-600 bg-green-50 border-green-200",
        REJECTED:  "text-red-500 bg-red-50 border-red-200",
        REVOKED:   "text-gray-400 bg-gray-50 border-gray-200",
    };
    return (
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${map[status]}`}>
            {status}
        </span>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PATIENT ACCESS PANEL
// ═══════════════════════════════════════════════════════════════════════════════
export const PatientAccessPanel: React.FC<{
    patientWallet: string;
    patientName:   string;
    dark:          boolean;
}> = ({ patientWallet: propWallet, patientName, dark }) => {
    const { addToast } = useToast();

    const [liveWallet,   setLiveWallet]   = useState<string>("");
    const [connections,  setConnections]  = useState<Connection[]>([]);
    const [doctorWallet, setDoctorWallet] = useState("");
    const [doctorName,   setDoctorName]   = useState("");
    const [loading,      setLoading]      = useState(false);
    const [tab,          setTab]          = useState<"REQUEST" | "MANAGE">("REQUEST");
    const [backendDown,  setBackendDown]  = useState(false);

    // Get real wallet from MetaMask
    useEffect(() => {
        const getWallet = async () => {
            if (window.ethereum) {
                try {
                    const accs: string[] = await window.ethereum.request({ method: "eth_accounts" });
                    if (accs.length > 0) {
                        setLiveWallet(accs[0].toLowerCase());
                        return;
                    }
                } catch {}
            }
            // Fallback to localStorage or prop
            const stored = localStorage.getItem("vault_wallet") || propWallet;
            setLiveWallet(stored.toLowerCase());
        };
        getWallet();
    }, [propWallet]);

    const myWallet = liveWallet || propWallet.toLowerCase();

    // Poll connections from backend every 3s
    const fetchConnections = useCallback(async () => {
        if (!myWallet) return;
        try {
            const data = await apiRequest(`${API}/connection/patient/${myWallet}`);
            setConnections(Array.isArray(data) ? data : []);
            setBackendDown(false);
        } catch {
            setBackendDown(true);
        }
    }, [myWallet]);

    useEffect(() => {
        fetchConnections();
        const iv = setInterval(fetchConnections, 3000);
        return () => clearInterval(iv);
    }, [fetchConnections]);

    const sendRequest = async () => {
        const w = doctorWallet.trim().toLowerCase();
        if (!w) { addToast("error", "Enter the doctor's wallet address."); return; }
        if (!w.startsWith("0x") || w.length < 10) {
            addToast("error", "Invalid wallet address — must start with 0x."); return;
        }
        if (w === myWallet) {
            addToast("error", "You cannot connect to yourself."); return;
        }
        setLoading(true);
        try {
            const { isNew } = await apiRequest(`${API}/connection/request`, {
                patientWallet: myWallet,
                patientName,
                doctorWallet:  w,
                doctorName:    doctorName || "Doctor",
            });
            if (isNew) {
                addToast("success", "Request sent! Doctor will see it on their dashboard.");
            } else {
                addToast("info", "A connection with this doctor already exists.");
            }
            setDoctorWallet("");
            setDoctorName("");
            setTab("MANAGE");
            fetchConnections();
        } catch {
            addToast("error", "Could not reach backend. Is the server running?");
        }
        setLoading(false);
    };

    const revoke = async (id: string, name: string, doctorW: string) => {
        try {
            await apiRequest(`${API}/connection/revoke`, {
                patientWallet: myWallet,
                doctorWallet:  doctorW.toLowerCase(),
            });
            addToast("info", `Access revoked for ${name}.`);
            fetchConnections();
        } catch {
            addToast("error", "Could not revoke — backend unavailable.");
        }
    };

    const pending   = connections.filter(c => c.status === "PENDING");
    const connected = connections.filter(c => c.status === "CONNECTED");
    const history   = connections.filter(c => c.status === "REVOKED" || c.status === "REJECTED");

    return (
        <div>
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h2 className={`text-xl font-bold ${S.tx(dark)}`}>Doctor Access Control</h2>
                    <p className={`text-xs mt-1 ${S.t2(dark)}`}>
                        Connect doctors by wallet address. All connections are stored on the backend server.
                    </p>
                </div>
            </div>

            {/* Backend status */}
            {backendDown && (
                <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    Backend offline — run <code className="bg-red-100 px-1 rounded">node backend/server.js</code> to enable cross-tab connections.
                </div>
            )}

            {/* Your wallet card */}
            <div className={`flex items-center gap-3 p-3 rounded-xl border mb-6 ${dark ? "bg-sky-500/5 border-sky-500/20" : "bg-sky-50 border-sky-200"}`}>
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sky-500 text-xs font-bold">YOU</span>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs text-sky-500 font-semibold mb-0.5">Your patient wallet</p>
                    <p className={`text-xs font-mono break-all ${S.t2(dark)}`}>{myWallet || "Loading…"}</p>
                </div>
                <button
                    onClick={() => { navigator.clipboard.writeText(myWallet); addToast("success", "Copied!"); }}
                    className="flex-shrink-0 text-xs text-sky-500 border border-sky-500/20 px-2 py-1 rounded-lg hover:bg-sky-500/10"
                >Copy</button>
            </div>

            {/* Sub-tabs */}
            <div className={`flex border-b mb-5 ${S.dv(dark)}`}>
                {(["REQUEST", "MANAGE"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                            className={`px-5 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                                tab === t ? "border-sky-500 text-sky-500" : `border-transparent ${S.t2(dark)}`
                            }`}>
                        {t === "REQUEST" ? "➕ New Connection"
                            : `📋 My Connections (${connections.filter(c => c.status !== "REVOKED" && c.status !== "REJECTED").length})`}
                    </button>
                ))}
            </div>

            {/* REQUEST TAB */}
            {tab === "REQUEST" && (
                <div className={`border rounded-2xl p-6 ${S.card(dark)}`}>
                    <h3 className={`text-sm font-bold mb-1 ${S.tx(dark)}`}>Connect a doctor by wallet address</h3>
                    <p className={`text-xs mb-5 ${S.t2(dark)}`}>
                        Ask your doctor to open their dashboard and share their wallet address with you. Enter it below.
                    </p>
                    <div className="space-y-4">
                        <div>
                            <label className={`block text-xs font-semibold mb-1.5 ${S.t2(dark)}`}>
                                Doctor's wallet address <span className="text-red-400">*</span>
                            </label>
                            <input value={doctorWallet} onChange={e => setDoctorWallet(e.target.value)}
                                   placeholder="0x1a2b3c4d5e6f…"
                                   className={`w-full border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none transition-all ${S.inp(dark)}`} />
                            <p className={`text-[10px] mt-1 ${S.t2(dark)}`}>42-character Ethereum address starting with 0x</p>
                        </div>
                        <div>
                            <label className={`block text-xs font-semibold mb-1.5 ${S.t2(dark)}`}>Doctor's name (optional)</label>
                            <input value={doctorName} onChange={e => setDoctorName(e.target.value)}
                                   placeholder="Dr. Sunita Mehta"
                                   className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none transition-all ${S.inp(dark)}`} />
                        </div>
                        <button onClick={sendRequest} disabled={loading || !doctorWallet.trim()}
                                className="w-full py-3 rounded-xl text-sm font-bold bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                            {loading
                                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                                : "Send Connection Request"
                            }
                        </button>
                    </div>

                    <div className={`mt-6 pt-5 border-t ${S.dv(dark)}`}>
                        <p className={`text-xs font-semibold mb-3 uppercase tracking-wider ${S.t2(dark)}`}>How it works</p>
                        {[
                            ["1", "Enter your doctor's wallet address and send a request"],
                            ["2", "Doctor sees the request on their dashboard (Patients → + Requests)"],
                            ["3", "Doctor clicks Accept — you're now connected"],
                            ["4", "Doctor can view your medical records. You can revoke anytime."],
                        ].map(([n, s]) => (
                            <div key={n} className="flex items-start gap-2 mb-2">
                                <span className="w-5 h-5 rounded-full bg-sky-500/10 text-sky-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                                <p className={`text-xs ${S.t2(dark)}`}>{s}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MANAGE TAB */}
            {tab === "MANAGE" && (
                <div className="space-y-5">
                    {connected.length > 0 && (
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider mb-3 text-green-500">✓ Active Access ({connected.length})</p>
                            <div className="space-y-3">
                                {connected.map(c => (
                                    <div key={c.id} className={`border rounded-xl p-4 ${S.card(dark)}`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-sm font-bold text-green-500 flex-shrink-0">
                                                    {(c.doctorName || "D")[0]}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className={`text-sm font-semibold ${S.tx(dark)}`}>{c.doctorName}</p>
                                                    <p className={`text-[10px] font-mono truncate ${S.t2(dark)}`}>{c.doctorWallet}</p>
                                                    <p className={`text-[10px] ${S.t2(dark)}`}>
                                                        Connected {c.connectedAt ? new Date(c.connectedAt).toLocaleDateString("en-IN") : ""}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <StatusBadge status="CONNECTED" />
                                                <button onClick={() => revoke(c.id, c.doctorName, c.doctorWallet)}
                                                        className="text-[10px] text-red-400 hover:text-red-300 border border-red-400/20 px-2.5 py-1 rounded-lg transition-all font-semibold">
                                                    Revoke
                                                </button>
                                            </div>
                                        </div>
                                        {c.txHash && (
                                            <div className={`mt-3 pt-3 border-t ${S.dv(dark)}`}>
                                                <p className={`text-[9px] font-mono truncate ${S.t2(dark)}`}>🔗 Tx: {c.txHash}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {pending.length > 0 && (
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider mb-3 text-yellow-500">⏳ Awaiting Doctor Approval ({pending.length})</p>
                            <div className="space-y-3">
                                {pending.map(c => (
                                    <div key={c.id} className={`border rounded-xl p-4 ${S.card(dark)}`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-sm font-bold text-yellow-500 flex-shrink-0">
                                                    {(c.doctorName || "D")[0]}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className={`text-sm font-semibold ${S.tx(dark)}`}>{c.doctorName}</p>
                                                    <p className={`text-[10px] font-mono truncate ${S.t2(dark)}`}>{c.doctorWallet}</p>
                                                    <p className={`text-[10px] ${S.t2(dark)}`}>Sent {new Date(c.requestedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                                                </div>
                                            </div>
                                            <StatusBadge status="PENDING" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {history.length > 0 && (
                        <div>
                            <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${S.t2(dark)}`}>History</p>
                            <div className="space-y-2">
                                {history.map(c => (
                                    <div key={c.id} className={`border rounded-xl p-3 opacity-50 ${S.card(dark)}`}>
                                        <div className="flex items-center justify-between">
                                            <div className="min-w-0">
                                                <p className={`text-xs font-medium ${S.tx(dark)}`}>{c.doctorName}</p>
                                                <p className={`text-[10px] font-mono truncate ${S.t2(dark)}`}>{c.doctorWallet}</p>
                                            </div>
                                            <StatusBadge status={c.status} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {connections.length === 0 && (
                        <div className={`text-center py-12 border rounded-2xl ${S.card(dark)}`}>
                            <p className="text-3xl mb-3">🔗</p>
                            <p className={`text-sm font-semibold ${S.tx(dark)}`}>No connections yet</p>
                            <p className={`text-xs mt-1 ${S.t2(dark)}`}>Go to "New Connection" to connect your first doctor.</p>
                            <button onClick={() => setTab("REQUEST")}
                                    className="mt-4 text-xs text-sky-500 border border-sky-500/20 px-4 py-2 rounded-xl">
                                Connect a doctor →
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  DOCTOR ACCESS PANEL
// ═══════════════════════════════════════════════════════════════════════════════
export const DoctorAccessPanel: React.FC<{
    doctorWallet:  string;
    doctorName:    string;
    dark:          boolean;
    onViewPatient?: (wallet: string, name: string) => void;
}> = ({ doctorWallet, doctorName, dark, onViewPatient }) => {
    const { addToast }  = useToast();
    const [connections, setConnections] = useState<Connection[]>([]);
    const [tab,         setTab]         = useState<"REQUESTS" | "PATIENTS">("REQUESTS");
    const [backendDown, setBackendDown] = useState(false);

    const fetchConnections = useCallback(async () => {
        if (!doctorWallet) return;
        try {
            const data = await apiRequest(`${API}/connection/doctor/${doctorWallet.toLowerCase()}`);
            setConnections(Array.isArray(data) ? data : []);
            setBackendDown(false);
        } catch {
            setBackendDown(true);
        }
    }, [doctorWallet]);

    useEffect(() => {
        fetchConnections();
        const iv = setInterval(fetchConnections, 2000);
        return () => clearInterval(iv);
    }, [fetchConnections]);

    const pending   = connections.filter(c => c.status === "PENDING");
    const connected = connections.filter(c => c.status === "CONNECTED");

    const accept = async (c: Connection) => {
        console.log("[Accept] Sending:", { patientWallet: c.patientWallet, doctorWallet: c.doctorWallet });
        try {
            await apiRequest(`${API}/connection/accept`, {
                patientWallet: c.patientWallet,
                doctorWallet:  doctorWallet.toLowerCase(),
            });
            addToast("success", `✓ Connected with ${c.patientName}! You can now view their records.`);
            fetchConnections();
        } catch (err: any) {
            console.error("[Accept] Error:", err.message);
            addToast("error", `Accept failed: ${err.message}`);
        }
    };

    const reject = async (c: Connection) => {
        try {
            await apiRequest(`${API}/connection/reject`, {
                patientWallet: c.patientWallet,
                doctorWallet:  doctorWallet.toLowerCase(),
            });
            addToast("info", `Request from ${c.patientName} rejected.`);
            fetchConnections();
        } catch {
            addToast("error", "Could not reject — backend unavailable.");
        }
    };

    const revoke = async (c: Connection) => {
        try {
            await apiRequest(`${API}/connection/revoke`, {
                patientWallet: c.patientWallet,
                doctorWallet:  doctorWallet.toLowerCase(),
            });
            addToast("info", `Access for ${c.patientName} revoked.`);
            fetchConnections();
        } catch {
            addToast("error", "Could not revoke — backend unavailable.");
        }
    };

    return (
        <div>
            <div className="mb-5">
                <h2 className={`text-lg font-bold ${S.tx(dark)}`}>Patient Connections</h2>
                <p className={`text-xs mt-0.5 ${S.t2(dark)}`}>Requests update every 2 seconds automatically.</p>
            </div>

            {backendDown && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">
                    <span className="font-bold">⚠ Backend offline.</span> Run <code className="bg-red-100 px-1 rounded">node backend/server.js</code>
                </div>
            )}

            {/* Doctor wallet — share with patients */}
            <div className={`flex items-center gap-3 p-4 rounded-2xl border mb-5 ${dark ? "bg-green-500/5 border-green-500/20" : "bg-green-50 border-green-200"}`}>
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-green-500 text-xs font-bold">DR</span>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-green-500 font-bold mb-1">📋 Share this address with your patients</p>
                    <p className={`text-xs font-mono break-all ${S.t2(dark)}`}>{doctorWallet || "Loading wallet…"}</p>
                </div>
                <button
                    onClick={() => { navigator.clipboard.writeText(doctorWallet); addToast("success", "Wallet address copied!"); }}
                    className="flex-shrink-0 text-xs text-green-500 border border-green-500/30 px-3 py-1.5 rounded-xl font-semibold hover:bg-green-500/10 transition-all"
                >Copy</button>
            </div>

            {/* Sub-tabs */}
            <div className={`flex border-b mb-5 ${S.dv(dark)}`}>
                <button onClick={() => setTab("REQUESTS")}
                        className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${tab === "REQUESTS" ? "border-green-500 text-green-500" : `border-transparent ${S.t2(dark)}`}`}>
                    Pending Requests
                    {pending.length > 0 && (
                        <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">{pending.length}</span>
                    )}
                </button>
                <button onClick={() => setTab("PATIENTS")}
                        className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${tab === "PATIENTS" ? "border-green-500 text-green-500" : `border-transparent ${S.t2(dark)}`}`}>
                    Connected ({connected.length})
                </button>
                <button onClick={fetchConnections}
                        className={`ml-auto mb-1 px-3 text-xs ${S.t2(dark)} hover:text-green-500`}>↻ Refresh</button>
            </div>

            {/* PENDING REQUESTS */}
            {tab === "REQUESTS" && (
                pending.length === 0 ? (
                    <div className={`text-center py-12 border rounded-2xl ${S.card(dark)}`}>
                        <p className="text-3xl mb-3">📬</p>
                        <p className={`text-sm font-semibold ${S.tx(dark)}`}>No pending requests</p>
                        <p className={`text-xs mt-1 ${S.t2(dark)}`}>Share your wallet address with patients. Requests appear here automatically.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {pending.map(c => (
                            <div key={c.id} className={`border rounded-2xl p-5 ${S.card(dark)}`}>
                                <div className="flex items-start justify-between gap-4 mb-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-12 h-12 rounded-full bg-sky-500/10 flex items-center justify-center text-lg font-bold text-sky-500 flex-shrink-0">
                                            {(c.patientName || "P")[0]}
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`font-bold ${S.tx(dark)}`}>{c.patientName}</p>
                                            <p className={`text-xs font-mono truncate ${S.t2(dark)}`}>{c.patientWallet}</p>
                                            <p className={`text-xs ${S.t2(dark)}`}>
                                                {new Date(c.requestedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                                            </p>
                                        </div>
                                    </div>
                                    <StatusBadge status="PENDING" />
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => accept(c)}
                                            className="flex-1 py-2 rounded-xl text-sm font-bold bg-green-500 hover:bg-green-600 text-white transition-all">
                                        ✓ Accept
                                    </button>
                                    <button onClick={() => reject(c)}
                                            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${dark ? "border-white/10 text-gray-400 hover:text-red-400" : "border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200"}`}>
                                        ✕ Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* CONNECTED PATIENTS */}
            {tab === "PATIENTS" && (
                connected.length === 0 ? (
                    <div className={`text-center py-12 border rounded-2xl ${S.card(dark)}`}>
                        <p className="text-3xl mb-3">👥</p>
                        <p className={`text-sm font-semibold ${S.tx(dark)}`}>No connected patients yet</p>
                        <button onClick={() => setTab("REQUESTS")} className="mt-3 text-xs text-green-500">View pending →</button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {connected.map(c => (
                            <div key={c.id} className={`border rounded-2xl p-4 ${S.card(dark)}`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-11 h-11 rounded-full bg-green-500/10 flex items-center justify-center text-sm font-bold text-green-500 flex-shrink-0">
                                            {(c.patientName || "P")[0]}
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`font-semibold ${S.tx(dark)}`}>{c.patientName}</p>
                                            <p className={`text-[10px] font-mono truncate ${S.t2(dark)}`}>{c.patientWallet}</p>
                                            <p className={`text-[10px] ${S.t2(dark)}`}>
                                                Since {c.connectedAt ? new Date(c.connectedAt).toLocaleDateString("en-IN") : ""}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        {onViewPatient && (
                                            <button onClick={() => onViewPatient(c.patientWallet, c.patientName)}
                                                    className="text-xs text-sky-500 border border-sky-500/20 px-3 py-1.5 rounded-xl font-semibold hover:bg-sky-500/10">
                                                View Records →
                                            </button>
                                        )}
                                        <button onClick={() => revoke(c)}
                                                className="text-xs text-red-400 border border-red-400/20 px-3 py-1.5 rounded-xl font-semibold hover:bg-red-500/10">
                                            Revoke
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
};
