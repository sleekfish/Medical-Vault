import React, { useState, useEffect, useRef } from "react";
import {
    FileText, Upload, Lock, Share2, Stethoscope, Eye, ShieldCheck,
    Database, TrendingUp, Sparkles, QrCode, Bell, Shield, Activity,
    Settings, Video, Calendar, CheckCircle, AlertTriangle, Clock,
    Plus, RefreshCw, ExternalLink, Copy, Download,
} from "../components/ui/Icons";

import {
    MOCK_RECORDS, MOCK_APPOINTMENTS, MOCK_HEALTH_ALERTS, MOCK_ACCESS_LOGS,
} from "../services/mockData";
import { DOCTORS } from "../services/doctor";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { API_BASE_URL } from "../services/apiConfig";
import DocumentViewerModal from "../components/DocumentViewerModal";
import ManageAccessPanel from "../components/ManageAccessPanel";
import { PatientAccessPanel } from "./Walletconnect";
import FabricAuditPanel from "../components/FabricAuditPanel";
import InsuranceClaimsPanel from "../components/InsuranceClaimsPanel";
import NotificationBell from "../components/ui/NotificationBell";
import { MedicalRecord, Appointment, UserRole, AccessLog } from "../types";

// ─── Lazy imports OUTSIDE component (critical — never inside render) ──────────
const HealthTrends   = React.lazy(() => import("../components/HealthTrends").catch(() => ({ default: () => <p className="p-6 text-red-500">HealthTrends failed to load</p> })));
const SymptomChecker = React.lazy(() => import("../components/SymptomChecker").catch(() => ({ default: () => <p className="p-6 text-red-500">SymptomChecker failed to load</p> })));
const PrescriptionQR = React.lazy(() => import("../components/PrescriptionQRPanel").catch(() => ({ default: () => <p className="p-6 text-red-500">PrescriptionQR failed to load</p> })));
const RecordExpiry   = React.lazy(() => import("../components/RecordExpiry").catch(() => ({ default: () => <p className="p-6 text-red-500">RecordExpiry failed to load</p> })));
const Telemedicine   = React.lazy(() => import("../components/Telemedicine").catch(() => ({ default: () => <p className="p-6 text-red-500">Telemedicine failed to load</p> })));
const SettingsPanel  = React.lazy(() => import("../components/SettingsPanel").catch(() => ({ default: () => <p className="p-6 text-red-500">Settings failed to load</p> })));

// ─── Types ───────────────────────────────────────────────────────────────────
type Tab = "OVERVIEW" | "VAULT" | "ACCESS" | "BOOK" | "TRENDS" | "AI" |
    "PRESCRIPTIONS" | "AUDIT" | "TELE" | "ALERTS" | "SETTINGS" | "CLAIMS";

// ─── Theme helpers ────────────────────────────────────────────────────────────
const card = (d: boolean) => d ? "bg-[#0f0f0f] border-white/[0.08]" : "bg-white border-gray-200 shadow-sm";
const tx   = (d: boolean) => d ? "text-white"    : "text-gray-900";
const t2   = (d: boolean) => d ? "text-gray-400" : "text-gray-500";
const dv   = (d: boolean) => d ? "border-white/[0.08]" : "border-gray-100";

// ─── Chart.js loader ─────────────────────────────────────────────────────────
function loadChartJs(): Promise<void> {
    return new Promise(resolve => {
        if ((window as any).Chart) { resolve(); return; }
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
    });
}

// ─── File utilities ───────────────────────────────────────────────────────────


// IPFS handled by dedicated service
import { uploadEncryptedMedicalFile, listMedicalRecords, isRealCid } from "../services/ipfsService";

// ─── Live vitals hook ─────────────────────────────────────────────────────────
function useLiveVitals() {
    const [hr, setHr]           = useState(72);
    const [spo2, setSpo2]       = useState(99);
    const [sys, setSys]         = useState(120);
    const [hrH, setHrH]         = useState<number[]>(() => Array.from({ length: 30 }, (_, i) => 70 + Math.round(Math.sin(i * 0.3) * 5)));
    const [spH, setSpH]         = useState<number[]>(() => Array.from({ length: 30 }, () => 98 + Math.round(Math.random())));
    const [lbls, setLbls]       = useState<string[]>(() => Array.from({ length: 30 }, (_, i) => `-${30 - i}s`));

    useEffect(() => {
        const iv = setInterval(() => {
            setHr(p  => { const n = Math.round(Math.min(105, Math.max(58,  p + (Math.random() - .48) * 2.5))); setHrH(h => [...h.slice(1), n]); return n; });
            setSpo2(p => { const n = Math.round(Math.min(100, Math.max(94,  p + (Math.random() - .48) * 0.4)) * 10) / 10; setSpH(h => [...h.slice(1), n]); return n; });
            setSys(p  => Math.min(140, Math.max(110, Math.round(p + (Math.random() - .48) * 1.5))));
            setLbls(l => [...l.slice(1), new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" })]);
        }, 1000);
        return () => clearInterval(iv);
    }, []);

    return { hr, spo2, bp: `${sys}/80`, hrH, spH, lbls };
}

// ─── Live chart component ─────────────────────────────────────────────────────
const LiveChart: React.FC<{ hrH: number[]; spH: number[]; lbls: string[]; dark: boolean }> = ({ hrH, spH, lbls, dark }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef  = useRef<any>(null);
    const [ready, setReady] = useState(!!(window as any).Chart);

    useEffect(() => { if (!ready) loadChartJs().then(() => setReady(true)); }, []);

    useEffect(() => {
        if (!ready || !canvasRef.current) return;
        chartRef.current?.destroy();
        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;
        const gc = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        const lc = dark ? "#9ca3af" : "#6b7280";
        chartRef.current = new (window as any).Chart(ctx, {
            type: "line",
            data: {
                labels: lbls,
                datasets: [
                    { data: hrH, borderColor: "#E24B4A", backgroundColor: "rgba(226,75,74,0.08)",  borderWidth: 2, pointRadius: 0, tension: .4, fill: true },
                    { data: spH, borderColor: "#378ADD", backgroundColor: "rgba(55,138,221,0.08)", borderWidth: 2, pointRadius: 0, tension: .4, fill: true, yAxisID: "y2" },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x:  { ticks: { maxTicksLimit: 6, font: { size: 10 }, color: lc }, grid: { color: gc } },
                    y:  { min: 50, max: 115, ticks: { font: { size: 10 }, color: "#E24B4A", callback: (v: any) => `${v}bpm` }, grid: { color: gc } },
                    y2: { position: "right", min: 90, max: 102, display: false },
                },
            },
        });
        return () => { chartRef.current?.destroy(); chartRef.current = null; };
    }, [ready, dark]);

    useEffect(() => {
        if (!chartRef.current) return;
        chartRef.current.data.labels           = lbls;
        chartRef.current.data.datasets[0].data = hrH;
        chartRef.current.data.datasets[1].data = spH;
        chartRef.current.update("none");
    }, [hrH, spH, lbls]);

    if (!ready) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading chart…</div>;
    return <canvas ref={canvasRef} />;
};

// ─── Stable Suspense wrapper ─────────────────────────────────────────────────
// IMPORTANT: this component must live OUTSIDE PatientDashboard.
// PatientDashboard re-renders every second because of live vitals. If Sub is
// declared inside PatientDashboard, React treats it as a new component type on
// every render and remounts the prescription panel, which closes its modal.
const SubPage: React.FC<{
    children: React.ReactNode;
    dark: boolean;
    tab: Tab;
}> = ({ children, dark, tab }) => (
    <React.Suspense fallback={
        <div className={`flex items-center justify-center py-20 text-sm ${t2(dark)}`}>
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading…
        </div>
    }>
        <div
            className={`border rounded-xl ${tab === "SETTINGS" ? "overflow-hidden" : "p-6"} ${card(dark)}`}
            style={tab === "SETTINGS" ? { minHeight: 600 } : {}}
        >
            {children}
        </div>
    </React.Suspense>
);

// ─── Audit trail (inline — avoids import failures) ────────────────────────────
const AuditTrail: React.FC<{ dark: boolean }> = ({ dark }) => {
    const { addToast } = useToast();
    const logs = MOCK_ACCESS_LOGS as unknown as AccessLog[];
    const [filter, setFilter] = useState<"ALL" | "GRANTED" | "REVOKED" | "ACCESSED">("ALL");
    const filtered = filter === "ALL" ? logs : logs.filter(l => l.action === filter);

    const badge: Record<string, string> = {
        GRANTED:  "text-green-600 bg-green-50 border-green-200",
        REVOKED:  "text-red-500   bg-red-50   border-red-200",
        ACCESSED: "text-sky-600   bg-sky-50   border-sky-200",
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-green-500/10 rounded-lg"><ShieldCheck size={18} className="text-green-500" /></div>
                    <div>
                        <h3 className={`font-bold ${tx(dark)}`}>Consent Audit Trail</h3>
                        <p className={`text-xs ${t2(dark)}`}>On-chain immutable log · PDPB 2023</p>
                    </div>
                </div>
                <button onClick={() => addToast("info", "Audit export queued.")}
                        className={`flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg transition-all ${dark ? "border-white/10 text-gray-400 hover:text-white" : "border-gray-200 text-gray-500 hover:text-gray-900"}`}>
                    <Download size={13} /> Export PDF
                </button>
            </div>

            <div className="flex gap-2 mb-5 flex-wrap">
                {(["ALL", "GRANTED", "ACCESSED", "REVOKED"] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${filter === f ? "border-sky-500 text-sky-500 bg-sky-500/10" : dark ? "border-white/10 text-gray-400 hover:border-white/20" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}>
                        {f === "ALL" ? "All events" : f === "GRANTED" ? "Access granted" : f === "ACCESSED" ? "Records accessed" : "Access revoked"}
                    </button>
                ))}
            </div>

            {filtered.length === 0
                ? <div className={`text-center py-12 ${t2(dark)}`}><ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-20" /><p className="text-sm">No events found.</p></div>
                : <div className="relative">
                    <div className={`absolute left-[18px] top-0 bottom-0 w-px ${dark ? "bg-white/5" : "bg-gray-100"}`} />
                    <div className="space-y-4">
                        {filtered.map((log, i) => (
                            <div key={i} className="relative flex gap-4 pl-10">
                                <div className={`absolute left-3 top-4 w-3 h-3 rounded-full border-2 ${log.action === "GRANTED" ? "bg-green-500 border-green-400" : log.action === "REVOKED" ? "bg-red-500 border-red-400" : "bg-sky-500 border-sky-400"}`} />
                                <div className={`flex-1 border rounded-xl p-4 ${card(dark)}`}>
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div>
                                            <p className={`text-sm font-medium ${tx(dark)}`}>{log.doctorName}</p>
                                            <p className={`text-xs ${t2(dark)}`}>{new Date(log.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                                        </div>
                                        <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border flex-shrink-0 ${badge[log.action]}`}>
                                            {log.action === "GRANTED" ? <CheckCircle size={11} /> : log.action === "REVOKED" ? <AlertTriangle size={11} /> : <Eye size={11} />}
                                            {log.action === "GRANTED" ? "Access granted" : log.action === "REVOKED" ? "Access revoked" : "Records accessed"}
                                        </span>
                                    </div>
                                    {log.recordsAccessed && log.recordsAccessed.length > 0 && (
                                        <div className={`mt-2 pt-2 border-t ${dv(dark)}`}>
                                            <p className={`text-xs mb-1 ${t2(dark)}`}>Records accessed:</p>
                                            <div className="flex flex-wrap gap-1">
                                                {log.recordsAccessed.map(r => (
                                                    <span key={r} className="text-[10px] bg-sky-50 text-sky-600 border border-sky-200 px-2 py-0.5 rounded-full">{r}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {log.txHash && (
                                        <div className={`mt-2 flex items-center gap-1.5 pt-2 border-t ${dv(dark)}`}>
                                            <Lock size={10} className={t2(dark)} />
                                            <span className={`text-[10px] font-mono truncate flex-1 ${t2(dark)}`}>{log.txHash}</span>
                                            <button onClick={() => { navigator.clipboard.writeText(log.txHash || ""); addToast("success", "Hash copied."); }}
                                                    className={`flex-shrink-0 ${t2(dark)} hover:text-sky-500 transition-colors`}><Copy size={11} /></button>
                                            <a href={`https://polygonscan.com/tx/${log.txHash}`} target="_blank" rel="noreferrer"
                                               className={`flex-shrink-0 ${t2(dark)} hover:text-sky-500 transition-colors`}><ExternalLink size={11} /></a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }
        </div>
    );
};

// ─── Access manager (inline) ──────────────────────────────────────────────────
const AccessManager: React.FC<{ dark: boolean; patientWallet: string }> = ({ dark, patientWallet }) => {
    const { addToast } = useToast();
    const [access,  setAccess]  = useState<Record<string, boolean>>({});
    const [pending, setPending] = useState<Record<string, boolean>>({});

    const toggle = async (docId: string, docName: string, grant: boolean) => {
        setPending(p => ({ ...p, [docId]: true }));
        await new Promise(r => setTimeout(r, 1200));
        try {
            await fetch(`${API_BASE_URL}/${grant ? "grant-access" : "revoke-access"}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patientWallet, doctorId: docId }),
            });
        } catch { /* backend offline */ }
        setAccess(p  => ({ ...p, [docId]: grant }));
        setPending(p => ({ ...p, [docId]: false }));
        addToast(grant ? "success" : "info", grant ? `Access granted to ${docName}` : `Access revoked for ${docName}`);
    };

    return (
        <div>
            <div className="mb-6">
                <h2 className={`font-bold text-lg ${tx(dark)}`}>Doctor Access Control</h2>
                <p className={`text-xs mt-0.5 ${t2(dark)}`}>Grant or revoke access to your encrypted records. All changes are logged on-chain.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(DOCTORS as any[]).map(doc => (
                    <div key={doc.id} className={`border rounded-xl p-5 transition-all ${card(dark)}`}>
                        <div className="flex items-start gap-3 mb-3">
                            <div className="w-11 h-11 rounded-full bg-teal-500/10 flex items-center justify-center text-sm font-bold text-teal-500 flex-shrink-0">
                                {doc.name.split(" ").filter(Boolean).slice(-2).map((n: string) => n[0]).join("")}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className={`text-sm font-semibold ${tx(dark)}`}>{doc.name}</h3>
                                <p className={`text-xs ${t2(dark)}`}>{doc.specialization}</p>
                                <p className={`text-[10px] truncate ${t2(dark)}`}>{doc.hospital}</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map(s => (
                                    <span key={s} className={`text-xs ${s <= Math.round(doc.rating ?? 0) ? "text-amber-400" : dark ? "text-gray-700" : "text-gray-300"}`}>★</span>
                                ))}
                                <span className={`text-xs ml-1 ${t2(dark)}`}>{doc.rating}</span>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${doc.available ? "text-green-600 bg-green-50" : "text-gray-400 bg-gray-100"}`}>
                                {doc.available ? "● Available" : "○ Busy"}
                            </span>
                        </div>
                        <div className={`text-[10px] font-mono p-2 rounded-lg mb-3 truncate ${dark ? "bg-white/5 text-gray-500" : "bg-gray-50 text-gray-400 border border-gray-100"}`}>
                            {doc.walletAddress || `0x${doc.id.replace("doc_", "").padEnd(40, "0")}`}
                        </div>
                        {access[doc.id]
                            ? <button onClick={() => toggle(doc.id, doc.name, false)} disabled={pending[doc.id]}
                                      className={`w-full py-2 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 ${dark ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20" : "bg-red-50 text-red-500 border-red-200 hover:bg-red-100"}`}>
                                {pending[doc.id] ? <><RefreshCw size={11} className="animate-spin" />Writing to chain…</> : "Revoke Access"}
                            </button>
                            : <button onClick={() => toggle(doc.id, doc.name, true)} disabled={pending[doc.id]}
                                      className={`w-full py-2 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 ${dark ? "bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-sky-500/20" : "bg-sky-50 text-sky-500 border-sky-200 hover:bg-sky-100"}`}>
                                {pending[doc.id] ? <><RefreshCw size={11} className="animate-spin" />Writing to chain…</> : "Grant Access"}
                            </button>
                        }
                    </div>
                ))}
            </div>
        </div>
    );
};

// ═══════════════════ MAIN DASHBOARD ══════════════════════════════════════════
const PatientDashboard: React.FC = () => {
    const { addToast } = useToast();
    const { theme }    = useTheme();
    const dark         = theme === "dark";

    const patientWallet = (localStorage.getItem("vault_wallet") || "").toLowerCase();

    const [tab,    setTab]    = useState<Tab>("OVERVIEW");
    // @ts-ignore
    const [records, setRec]   = useState<MedicalRecord[]>(MOCK_RECORDS);
    const [viewing, setView]  = useState<MedicalRecord | null>(null);
    // @ts-ignore
    const [appts,  setAppts]  = useState<Appointment[]>(MOCK_APPOINTMENTS);
    const [selDoc, setSelDoc] = useState<any>(null);
    const [uploading, setUpl] = useState(false);
    const [progress, setProgress] = useState<{ name: string; stage: string; hash?: string; cid?: string } | null>(null);

    const vitals = useLiveVitals();
    // @ts-ignore
    const unread = (MOCK_HEALTH_ALERTS as any[]).filter(a => !a.read).length;

    // Records live in the backend (Pinata + AES-256-GCM), not in local state —
    // fetch the real ones on mount instead of leaving MOCK_RECORDS in place.
    useEffect(() => {
        if (!patientWallet) return;
        let cancelled = false;
        (async () => {
            try {
                const data = await listMedicalRecords(patientWallet, patientWallet);
                if (cancelled) return;
                const formatted: MedicalRecord[] = data.map(rec => ({
                    id: rec.recordId,
                    backendRecordId: rec.recordId,
                    name: rec.original.name,
                    type: rec.original.mimeType?.startsWith("image/") ? "IMAGE" : "PDF",
                    date: new Date(rec.createdAt).toISOString().split("T")[0],
                    hash: rec.ciphertextSha256,
                    ipfsCid: rec.cid,
                    notarized: true,
                    sharedWith: [],
                    encryptionType: "AES-GCM",
                    category: "Uploaded",
                }));
                setRec(formatted);
            } catch (err) {
                // Backend offline or auth failed — leave the demo records in place
                // so the UI still shows something rather than an empty vault.
                console.error("[Patient] fetchRecords error:", err);
            }
        })();
        return () => { cancelled = true; };
    }, [patientWallet]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUpl(true);
        setProgress({ name: file.name, stage: "Preparing encrypted upload…" });
        try {
            // The server encrypts first, hashes the ciphertext, and only then pins it to IPFS.
            const result = await uploadEncryptedMedicalFile(file, patientWallet, (stage) => {
                setProgress({ name: file.name, stage });
            });

            setProgress({ name: file.name, stage: "Saving encrypted-record metadata…", hash: result.ciphertextSha256, cid: result.cid });
            await new Promise(r => setTimeout(r, 900));

            // IMPORTANT: `id` must be the SAME value as the server's real,
            // Fabric-registered record ID (result.recordId) — never a
            // client-generated placeholder like `"rec_" + Date.now()`.
            // A mismatched `id` here is what was causing "Record ... not
            // found" chaincode errors when granting/revoking document
            // access: any UI (e.g. ManageAccessPanel) that reads
            // `record.id` to build its document picker was submitting an
            // ID that Fabric had never heard of. `backendRecordId` is kept
            // as an explicit alias for any code that already depends on it,
            // but the two must never diverge.
            const newRec: MedicalRecord = {
                id: result.recordId,
                name: file.name,
                type: file.type.includes("pdf") ? "PDF" : "IMAGE",
                date: new Date().toISOString().split("T")[0],
                hash: result.ciphertextSha256,
                ipfsCid: result.cid,
                backendRecordId: result.recordId,
                notarized: true,
                sharedWith: [],
                encryptionType: "AES-GCM",
                category: "Uploaded",
            };
            setRec(p => [newRec, ...p]);
            setProgress(null);
            addToast("success", `✓ ${file.name} encrypted with AES-256-GCM and stored on IPFS.`);
        } catch (err: any) {
            setProgress(null);
            addToast("error", `Upload failed: ${err?.message ?? "Unknown error"}`);
        }
        setUpl(false);
        e.target.value = "";
    };

    const book = async (doc: any, type: "IN_PERSON" | "TELEMEDICINE" = "IN_PERSON") => {
        const appt: Appointment = {
            id: "apt_" + Date.now(), patientWallet, doctorId: doc.id,
            doctorName: doc.name, specialization: doc.specialization,
            date: new Date(Date.now() + 86400000 * 3).toLocaleDateString("en-IN"),
            time: "11:00 AM", status: "PENDING", type,
        };
        await fetch(`${API_BASE_URL}/book-appointment`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(appt),
        }).catch(() => {});
        setAppts(p => [...p, appt]);
        addToast("success", `Appointment booked with ${doc.name}.`);
        if (type === "TELEMEDICINE") { setSelDoc(doc); setTab("TELE"); }
    };

    const sc: Record<string, string> = {
        CONFIRMED: "text-green-600 bg-green-50 border-green-200",
        PENDING:   "text-yellow-600 bg-yellow-50 border-yellow-200",
        COMPLETED: "text-gray-500 bg-gray-50 border-gray-200",
        CANCELLED: "text-red-500 bg-red-50 border-red-200",
    };

    const TABS = [
        { label: "Overview",      id: "OVERVIEW"      as Tab, icon: <Activity size={14} /> },
        { label: "Vault",         id: "VAULT"          as Tab, icon: <Database size={14} /> },
        { label: "Access",        id: "ACCESS"         as Tab, icon: <Shield size={14} /> },
        { label: "Book",          id: "BOOK"           as Tab, icon: <Calendar size={14} /> },
        { label: "Trends",        id: "TRENDS"         as Tab, icon: <TrendingUp size={14} /> },
        { label: "AI Check",      id: "AI"             as Tab, icon: <Sparkles size={14} /> },
        { label: "Prescriptions", id: "PRESCRIPTIONS"  as Tab, icon: <QrCode size={14} /> },
        { label: "Audit",         id: "AUDIT"          as Tab, icon: <ShieldCheck size={14} /> },
        { label: "Claims",        id: "CLAIMS"         as Tab, icon: <FileText size={14} /> },
        { label: "Tele",          id: "TELE"           as Tab, icon: <Video size={14} /> },
        { label: "Alerts",        id: "ALERTS"         as Tab, icon: <Bell size={14} /> },
        { label: "Settings",      id: "SETTINGS"       as Tab, icon: <Settings size={14} /> },
    ];

    return (
        <div className="min-h-screen bg-transparent pt-20 pb-16 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">

                {/* ── Header ── */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className={`text-3xl font-bold tracking-tight ${tx(dark)}`}>Patient Dashboard</h1>
                        <p className={`text-sm mt-1 ${t2(dark)}`}>
                            Connected: <span className="font-mono text-sky-500">{patientWallet.slice(0, 10)}…{patientWallet.slice(-4)}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <NotificationBell wallet={patientWallet} dark={dark} />
                        <label className={`flex items-center gap-2 px-5 py-2.5 rounded-xl cursor-pointer text-sm font-semibold transition-all shadow-sm text-white ${uploading ? "bg-sky-400 cursor-not-allowed" : "bg-sky-500 hover:bg-sky-600"}`}>
                            <Upload className="h-4 w-4" />
                            <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.png,.jpg,.jpeg" disabled={uploading} />
                            {uploading ? "Uploading…" : "Upload Record"}
                        </label>
                    </div>
                </div>

                {/* ── Upload progress ── */}
                {progress && (
                    <div className={`mb-6 border rounded-xl p-4 ${card(dark)}`}>
                        <div className="flex items-center gap-3 mb-3">
                            <RefreshCw size={16} className="text-sky-500 animate-spin flex-shrink-0" />
                            <div>
                                <p className={`text-sm font-medium ${tx(dark)}`}>{progress.name}</p>
                                <p className="text-xs text-sky-500 font-medium">{progress.stage}</p>
                            </div>
                        </div>
                        {progress.hash && (
                            <div className={`text-[10px] font-mono p-2 rounded-lg mb-1 ${dark ? "bg-white/5 text-gray-500" : "bg-gray-50 text-gray-400 border border-gray-100"}`}>
                                SHA-256: {progress.hash.slice(0, 32)}…
                            </div>
                        )}
                        {progress.cid && (
                            <div className={`text-[10px] font-mono p-2 rounded-lg ${dark ? "bg-white/5 text-gray-500" : "bg-gray-50 text-gray-400 border border-gray-100"}`}>
                                IPFS CID: {progress.cid.slice(0, 32)}…
                            </div>
                        )}
                        <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full bg-sky-500 rounded-full transition-all duration-500"
                                 style={{ width: progress.cid ? "90%" : progress.hash ? "55%" : "20%" }} />
                        </div>
                    </div>
                )}

                {/* ── Tab bar ── */}
                <div className={`flex gap-0.5 border-b mb-8 overflow-x-auto pb-px ${dv(dark)}`}>
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-all ${
                                    tab === t.id
                                        ? "border-sky-500 text-sky-500"
                                        : dark ? "border-transparent text-gray-500 hover:text-gray-300" : "border-transparent text-gray-400 hover:text-gray-700"
                                }`}>
                            {t.icon} {t.label}
                            {t.id === "ALERTS" && unread > 0 && (
                                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">{unread}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ════ OVERVIEW ════ */}
                {tab === "OVERVIEW" && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: "Heart rate",     value: `${vitals.hr}`,      unit: "BPM",   status: vitals.hr > 100 ? "High" : "Normal", tc: vitals.hr > 100 ? "text-red-500" : "text-green-500" },
                                { label: "SpO2",           value: `${vitals.spo2}`,    unit: "%",     status: "Optimal",  tc: "text-green-500" },
                                { label: "Blood pressure", value: vitals.bp,           unit: "mmHg",  status: "Normal",   tc: "text-green-500" },
                                { label: "Records",        value: `${records.length}`, unit: "total", status: "Secure",   tc: "text-sky-500"   },
                            ].map(s => (
                                <div key={s.label} className={`border rounded-xl p-5 ${card(dark)}`}>
                                    <p className={`text-xs mb-2 ${t2(dark)}`}>{s.label}</p>
                                    <div className="flex items-baseline gap-1.5 mb-1">
                                        <span className={`text-3xl font-bold ${tx(dark)}`}>{s.value}</span>
                                        <span className={`text-xs ${t2(dark)}`}>{s.unit}</span>
                                    </div>
                                    <span className={`text-xs font-semibold ${s.tc}`}>{s.status}</span>
                                </div>
                            ))}
                        </div>

                        <div className={`border rounded-xl p-5 ${card(dark)}`}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-4">
                                    <h3 className={`text-sm font-semibold ${tx(dark)}`}>Live vitals monitor</h3>
                                    <div className={`hidden sm:flex gap-4 text-xs ${t2(dark)}`}>
                                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#E24B4A] inline-block" /> Heart rate</span>
                                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#378ADD] inline-block" /> SpO2</span>
                                    </div>
                                </div>
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-green-500">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" /> Live
                                </span>
                            </div>
                            <div style={{ height: 240 }}>
                                <LiveChart hrH={vitals.hrH} spH={vitals.spH} lbls={vitals.lbls} dark={dark} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className={`border rounded-xl p-5 ${card(dark)}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className={`text-sm font-semibold ${tx(dark)}`}>Upcoming appointments</h3>
                                    <button onClick={() => setTab("BOOK")} className="text-xs text-sky-500 hover:text-sky-400">Book new →</button>
                                </div>
                                {appts.filter(a => a.status !== "COMPLETED").slice(0, 3).map(a => (
                                    <div key={a.id} className={`flex items-center justify-between py-3 border-b last:border-0 ${dv(dark)}`}>
                                        <div className="flex items-center gap-2.5">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${dark ? "bg-white/5" : "bg-gray-100"}`}>
                                                {a.type === "TELEMEDICINE" ? <Video size={14} className="text-violet-500" /> : <Stethoscope size={14} className="text-sky-500" />}
                                            </div>
                                            <div>
                                                <p className={`text-xs font-semibold ${tx(dark)}`}>{a.doctorName}</p>
                                                <p className={`text-[10px] ${t2(dark)}`}>{a.date}{a.time && ` · ${a.time}`}</p>
                                            </div>
                                        </div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${sc[a.status] ?? ""}`}>{a.status}</span>
                                    </div>
                                ))}
                                {appts.filter(a => a.status !== "COMPLETED").length === 0 && (
                                    <p className={`text-sm py-6 text-center ${t2(dark)}`}>No upcoming appointments</p>
                                )}
                            </div>

                            <div className={`border rounded-xl p-5 ${card(dark)}`}>
                                <h3 className={`text-sm font-semibold mb-4 ${tx(dark)}`}>Quick actions</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { label: "AI Symptom check", icon: <Sparkles size={15} />, tab: "AI"          as Tab, lc: dark ? "text-violet-400" : "text-violet-600", bc: dark ? "bg-violet-500/10 border-violet-500/20" : "bg-violet-50 border-violet-200" },
                                        { label: "Book appointment", icon: <Calendar size={15} />,  tab: "BOOK"        as Tab, lc: dark ? "text-sky-400"    : "text-sky-600",    bc: dark ? "bg-sky-500/10 border-sky-500/20"       : "bg-sky-50 border-sky-200" },
                                        { label: "Medical vault",    icon: <Database size={15} />,  tab: "VAULT"       as Tab, lc: dark ? "text-teal-400"   : "text-teal-600",   bc: dark ? "bg-teal-500/10 border-teal-500/20"     : "bg-teal-50 border-teal-200" },
                                        { label: "Health trends",    icon: <TrendingUp size={15} />,tab: "TRENDS"      as Tab, lc: dark ? "text-amber-400"  : "text-amber-600",  bc: dark ? "bg-amber-500/10 border-amber-500/20"   : "bg-amber-50 border-amber-200" },
                                    ].map(a => (
                                        <button key={a.label} onClick={() => setTab(a.tab)}
                                                className={`flex items-center gap-2.5 p-3.5 rounded-xl border text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 ${a.lc} ${a.bc}`}>
                                            {a.icon} {a.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ════ VAULT ════ */}
                {tab === "VAULT" && (
                    <div className={`border rounded-xl overflow-hidden ${card(dark)}`}>
                        <div className={`px-6 py-4 border-b flex items-center justify-between ${dv(dark)}`}>
                            <div>
                                <h2 className={`font-bold ${tx(dark)}`}>Medical Vault</h2>
                                <p className={`text-xs mt-0.5 ${t2(dark)}`}>{records.length} records · AES-256-GCM protected uploads</p>
                            </div>
                            <label className="flex items-center gap-1.5 text-xs bg-sky-500 text-white px-3 py-1.5 rounded-lg cursor-pointer hover:bg-sky-600 transition-all font-semibold">
                                <Plus size={13} />
                                <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.png,.jpg,.jpeg" disabled={uploading} />
                                Add record
                            </label>
                        </div>
                        {records.length === 0
                            ? <div className={`text-center py-16 ${t2(dark)}`}><Database className="w-12 h-12 mx-auto mb-3 opacity-20" /><p className="text-sm">No records yet. Upload your first document.</p></div>
                            : <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className={dark ? "bg-white/5" : "bg-gray-50"}>
                                    <tr>
                                        {["Document", "Type", "Date", "SHA-256 Hash", "IPFS CID", "Status", "Actions"].map(h => (
                                            <th key={h} className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider ${t2(dark)}`}>{h}</th>
                                        ))}
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {records.map(rec => (
                                        <tr key={rec.id} className={`border-t transition-colors ${dark ? "border-white/5 hover:bg-white/[0.02]" : "border-gray-100 hover:bg-gray-50"}`}>
                                            <td className="px-5 py-4 max-w-[200px]">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-sky-500 flex-shrink-0" />
                                                    <div>
                                                        <p className={`text-sm font-medium truncate ${tx(dark)}`}>{rec.name}</p>
                                                        <p className={`text-[10px] ${t2(dark)}`}>{rec.category}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={`px-5 py-4 text-xs ${t2(dark)}`}>
                                                <span className={`px-2 py-0.5 rounded-md font-medium ${dark ? "bg-white/5" : "bg-gray-100"}`}>{rec.type}</span>
                                            </td>
                                            <td className={`px-5 py-4 text-xs ${t2(dark)}`}>{rec.date}</td>
                                            <td className={`px-5 py-4 text-[10px] font-mono ${t2(dark)}`}>
                                                <div className="flex items-center gap-1">
                                                    <span className="truncate max-w-[90px]">{rec.hash.slice(0, 14)}…</span>
                                                    <button onClick={() => { navigator.clipboard.writeText(rec.hash); addToast("success", "Hash copied."); }}
                                                            className="hover:text-sky-500 flex-shrink-0 transition-colors"><Copy size={10} /></button>
                                                </div>
                                            </td>
                                            <td className={`px-5 py-4 text-[10px] font-mono ${t2(dark)}`}>
                                                <div className="flex items-center gap-1">
                                                    <span className="truncate max-w-[80px]">{rec.ipfsCid.slice(0, 10)}…</span>
                                                    {rec.fileUrl && (
                                                        <a href={rec.fileUrl} target="_blank" rel="noreferrer"
                                                           className="hover:text-sky-500 flex-shrink-0 transition-colors"><ExternalLink size={10} /></a>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                    <span className={`flex items-center gap-1 text-xs font-semibold ${rec.notarized ? "text-green-500" : "text-gray-400"}`}>
                                                        {rec.notarized ? <><CheckCircle size={11} /> Notarized</> : <><Clock size={11} /> Pending</>}
                                                    </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => setView(rec)}
                                                            className={`transition-colors ${dark ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-900"}`}>
                                                        <Eye className="h-4 w-4" />
                                                    </button>
                                                    {rec.fileUrl && (
                                                        <a href={rec.fileUrl} target="_blank" rel="noreferrer"
                                                           className="text-gray-400 hover:text-sky-500 transition-colors">
                                                            <Share2 className="h-4 w-4" />
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        }
                    </div>
                )}

                {/* ════ ACCESS ════ */}
                {tab === "ACCESS" && (
                    <div className="space-y-6">

                        {/* Patient ↔ Doctor connection */}
                        <div className={`border rounded-xl p-6 ${card(dark)}`}>
                            <PatientAccessPanel
                                patientWallet={patientWallet}
                                patientName="Patient"
                                dark={dark}
                            />
                        </div>

                        {/* Document-level access permissions */}
                        <div className={`border rounded-xl p-6 ${card(dark)}`}>
                            <ManageAccessPanel
                                patientWallet={patientWallet}
                                records={records}
                            />
                        </div>

                    </div>
                )}

                {/* ════ BOOK ════ */}
                {tab === "BOOK" && (
                    <div className="space-y-6">
                        {appts.length > 0 && (
                            <div className={`border rounded-xl p-5 ${card(dark)}`}>
                                <h3 className={`text-sm font-semibold mb-3 ${tx(dark)}`}>Your appointments</h3>
                                <div className="space-y-1">
                                    {appts.map(a => (
                                        <div key={a.id} className={`flex items-center justify-between py-2.5 border-b last:border-0 ${dv(dark)}`}>
                                            <div className="flex items-center gap-2.5">
                                                {a.type === "TELEMEDICINE" ? <Video size={13} className="text-violet-500" /> : <Stethoscope size={13} className="text-sky-500" />}
                                                <div>
                                                    <p className={`text-xs font-medium ${tx(dark)}`}>{a.doctorName} · {a.specialization}</p>
                                                    <p className={`text-[10px] ${t2(dark)}`}>{a.date}{a.time && ` · ${a.time}`} · {a.type}</p>
                                                </div>
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${sc[a.status] ?? ""}`}>{a.status}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(DOCTORS as any[]).map(doc => (
                                <div key={doc.id} className={`border rounded-xl p-5 ${card(dark)}`}>
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-11 h-11 rounded-full bg-sky-500/10 flex items-center justify-center">
                                            <Stethoscope size={18} className="text-sky-500" />
                                        </div>
                                        <div>
                                            <h3 className={`text-sm font-semibold ${tx(dark)}`}>{doc.name}</h3>
                                            <p className={`text-xs ${t2(dark)}`}>{doc.specialization}</p>
                                        </div>
                                    </div>
                                    <p className={`text-xs mb-1 ${t2(dark)}`}>{doc.hospital}</p>
                                    <div className="flex items-center gap-0.5 mb-4">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <span key={s} className={`text-sm ${s <= Math.round(doc.rating ?? 0) ? "text-amber-400" : dark ? "text-gray-700" : "text-gray-300"}`}>★</span>
                                        ))}
                                        <span className={`text-xs ml-1 ${t2(dark)}`}>{doc.rating}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => book(doc, "IN_PERSON")}
                                                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${dark ? "bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-sky-500/20" : "bg-sky-50 text-sky-600 border-sky-200 hover:bg-sky-100"}`}>
                                            In person
                                        </button>
                                        <button onClick={() => book(doc, "TELEMEDICINE")}
                                                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold border transition-all ${dark ? "bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/20" : "bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100"}`}>
                                            <Video size={11} /> Video
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ════ AUDIT ════ */}
                {tab === "AUDIT" && (
                    <div className={`border rounded-xl p-6 ${card(dark)}`}>
                        <FabricAuditPanel patientWallet={patientWallet} records={records} />
                    </div>
                )}

                {/* ════ CLAIMS ════ */}
                {tab === "CLAIMS" && (
                    <div className={`border rounded-xl p-6 ${card(dark)}`}>
                        <InsuranceClaimsPanel patientWallet={patientWallet} records={records} />
                    </div>
                )}

                {/* ════ Lazy sub-pages ════ */}
                {tab === "TRENDS"        && <SubPage dark={dark} tab={tab}><HealthTrends /></SubPage>}
                {tab === "AI"            && <SubPage dark={dark} tab={tab}><SymptomChecker records={records} /></SubPage>}
                {tab === "PRESCRIPTIONS" && <SubPage dark={dark} tab={tab}>
                    <PrescriptionQR role="PATIENT" patientWallet={patientWallet} />
                </SubPage>}
                {tab === "TELE"          && <SubPage dark={dark} tab={tab}><Telemedicine role="PATIENT" doctor={selDoc ?? (DOCTORS as any[])[0]} records={records} /></SubPage>}
                {tab === "ALERTS"        && <SubPage dark={dark} tab={tab}><RecordExpiry records={records} /></SubPage>}
                {tab === "SETTINGS"      && <SubPage dark={dark} tab={tab}><SettingsPanel role={UserRole.PATIENT} walletAddress={patientWallet} /></SubPage>}
            </div>

            <React.Suspense fallback={null}>
                <DocumentViewerModal isOpen={!!viewing} onClose={() => setView(null)} record={viewing} requesterWallet={patientWallet} allowDownload />
            </React.Suspense>
        </div>
    );
};

export default PatientDashboard;
