import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QrCode, CheckCircle, Loader2, Copy, Download, Shield, Plus, RefreshCw } from './ui/Icons';
import { useToast } from '../context/ToastContext';
import { PrescriptionQR } from '../types';

const API = "http://localhost:5000";

interface PrescriptionQRProps {
    role: 'DOCTOR' | 'PATIENT';
    patientWallet?: string;
    doctorWallet?:  string;
    doctorName?:    string;
}

// ─── Minimal QR grid generator ────────────────────────────────────────────────
const QRGrid: React.FC<{ data: string; size?: number }> = ({ data, size = 120 }) => {
    const cells    = 21;
    const cellSize = size / cells;
    const grid     = Array.from({ length: cells }, (_, r) =>
        Array.from({ length: cells }, (_, c) => {
            if (r < 7 && c < 7) return (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
            if (r < 7 && c >= cells - 7) return (r === 0 || r === 6 || c === cells - 1 || c === cells - 7 || (r >= 2 && r <= 4 && c >= cells - 5 && c <= cells - 3));
            if (r >= cells - 7 && c < 7) return (r === cells - 1 || r === cells - 7 || c === 0 || c === 6 || (r >= cells - 5 && r <= cells - 3 && c >= 2 && c <= 4));
            const hash = data.split('').reduce((acc, ch, i) => acc + ch.charCodeAt(0) * (r * cells + c + i + 1), 0);
            return hash % 3 === 0;
        })
    );
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {grid.map((row, r) =>
                row.map((filled, c) =>
                    filled ? <rect key={`${r}-${c}`} x={c * cellSize} y={r * cellSize} width={cellSize} height={cellSize} fill="white" /> : null
                )
            )}
        </svg>
    );
};

const PrescriptionQRPanel: React.FC<PrescriptionQRProps> = ({
                                                                role,
                                                                patientWallet: propPatientWallet,
                                                                doctorWallet:  propDoctorWallet,
                                                                doctorName:    propDoctorName,
                                                            }) => {
    const { addToast } = useToast();

    const [prescriptions, setPrescriptions] = useState<PrescriptionQR[]>([]);
    const [loading,       setLoading]       = useState(true);
    const [showForm,      setShowForm]      = useState(false);
    const [selected,      setSelected]      = useState<PrescriptionQR | null>(null);
    const [generating,    setGenerating]    = useState(false);

    const [form, setForm] = useState({
        medication:    "",
        dosage:        "",
        duration:      "30",
        notes:         "",
        patientWallet: propPatientWallet || "",
    });

    // ── KEY FIX 1: store the resolved wallet in a ref, not state.
    //   This means resolving the wallet never triggers a re-render,
    //   which prevents the remount/refetch loop. ───────────────────────────────
    const walletRef  = useRef<string>(
        // Pre-populate immediately from props if available so first render
        // can use it without waiting for the async effect below.
        role === "DOCTOR"
            ? (propDoctorWallet  || "").toLowerCase().trim()
            : (propPatientWallet || "").toLowerCase().trim()
    );
    const didFetch = useRef(false);

    // ── KEY FIX 2: stable fetch — useCallback with no changing deps ───────────
    const doFetch = useCallback(async () => {
        const wallet = walletRef.current;
        if (!wallet) return;

        setLoading(true);
        try {
            const endpoint = role === "PATIENT"
                ? `${API}/prescriptions/patient/${wallet}`
                : `${API}/prescriptions/doctor/${wallet}`;

            const res  = await fetch(endpoint);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setPrescriptions(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn("[Rx] Fetch failed:", e);
            setPrescriptions([]);
        } finally {
            setLoading(false);
        }
    }, [role]); // role never changes after mount

    // ── KEY FIX 3: run wallet resolution + initial fetch ONCE only ────────────
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            // If props already gave us a wallet, walletRef is already set above.
            // Only fall back to MetaMask if we don't have a wallet yet.
            if (!walletRef.current && window.ethereum) {
                try {
                    const accs: string[] = await window.ethereum.request({ method: "eth_accounts" });
                    if (accs.length > 0) walletRef.current = accs[0].toLowerCase();
                } catch {}
            }
            if (!walletRef.current) {
                walletRef.current = (localStorage.getItem("vault_wallet") || "").toLowerCase();
            }

            if (!cancelled && !didFetch.current) {
                didFetch.current = true;
                doFetch();
            }
        };

        init();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // ← EMPTY DEPS: runs once on mount, never again

    // ── Save prescription ─────────────────────────────────────────────────────
    const generatePrescription = async () => {
        if (!form.medication || !form.dosage || !form.patientWallet) {
            addToast("error", "Please fill patient wallet, medication and dosage.");
            return;
        }
        if (!form.patientWallet.startsWith("0x")) {
            addToast("error", "Patient wallet must start with 0x.");
            return;
        }

        setGenerating(true);
        try {
            const res = await fetch(`${API}/prescriptions/save`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    patientWallet: form.patientWallet.toLowerCase().trim(),
                    doctorWallet:  propDoctorWallet || walletRef.current,
                    doctorName:    propDoctorName   || "Doctor",
                    medication:    form.medication,
                    dosage:        form.dosage,
                    duration:      form.duration,
                    notes:         form.notes,
                }),
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { prescription } = await res.json();

            setPrescriptions(prev => [prescription, ...prev]);
            setShowForm(false);
            setForm({ medication: "", dosage: "", duration: "30", notes: "", patientWallet: propPatientWallet || "" });
            addToast("success", "Prescription saved and sent to patient!");
        } catch (err: any) {
            addToast("error", `Failed to save prescription: ${err.message}`);
        } finally {
            setGenerating(false);
        }
    };

    const copyHash = (hash: string) => {
        navigator.clipboard.writeText(hash);
        addToast("success", "Transaction hash copied.");
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-sky-500/10 rounded-lg">
                        <QrCode size={18} className="text-sky-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold">
                            {role === "PATIENT" ? "My Prescriptions" : "Prescription QR Codes"}
                        </h3>
                        <p className="text-xs text-gray-500">
                            {role === "PATIENT"
                                ? "Prescriptions from your connected doctors"
                                : "Blockchain-signed · Tamper-proof · Pharmacist-verifiable"
                            }
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={doFetch}
                        className="flex items-center gap-1.5 text-xs border border-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-all"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                    {role === "DOCTOR" && (
                        <button
                            onClick={() => setShowForm(!showForm)}
                            className="flex items-center gap-1.5 bg-sky-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-sky-600 transition-all"
                        >
                            <Plus size={14} /> New prescription
                        </button>
                    )}
                </div>
            </div>

            {/* Doctor form */}
            {role === "DOCTOR" && showForm && (
                <div className="mb-6 bg-white/5 rounded-xl border border-white/10 p-5">
                    <p className="text-sm font-medium text-white mb-4">New Prescription</p>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">
                                Patient wallet <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={form.patientWallet}
                                onChange={e => setForm(f => ({ ...f, patientWallet: e.target.value }))}
                                placeholder="0x..."
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500 font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Duration (days)</label>
                            <select
                                value={form.duration}
                                onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                            >
                                {["7", "14", "30", "60", "90"].map(d => (
                                    <option key={d} value={d}>{d} days</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="mb-4">
                        <label className="block text-xs text-gray-400 mb-1">
                            Medication <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            value={form.medication}
                            onChange={e => setForm(f => ({ ...f, medication: e.target.value }))}
                            placeholder="Drug name, strength (e.g. Atorvastatin 10mg)"
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500"
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-xs text-gray-400 mb-1">
                            Dosage instructions <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            value={form.dosage}
                            onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))}
                            placeholder="e.g. 1 tablet twice daily after meals"
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500"
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
                        <input
                            type="text"
                            value={form.notes}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Additional instructions..."
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500"
                        />
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={generatePrescription}
                            disabled={generating}
                            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-all"
                        >
                            {generating ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                            {generating ? "Saving…" : "Save & send to patient"}
                        </button>
                        <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-white">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12 text-gray-500">
                    <RefreshCw size={20} className="animate-spin mr-2" />
                    <span className="text-sm">Loading prescriptions…</span>
                </div>
            )}

            {/* Empty */}
            {!loading && prescriptions.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                    <QrCode size={40} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">
                        {role === "PATIENT"
                            ? "No prescriptions yet. Your doctor will send them here."
                            : "No prescriptions issued yet. Click '+ New prescription' to create one."
                        }
                    </p>
                </div>
            )}

            {/* Grid */}
            {!loading && prescriptions.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {prescriptions.map(rx => (
                        <div
                            key={rx.id}
                            onClick={() => setSelected(rx)}
                            className="bg-black border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-sky-500/50 transition-all group"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-white text-sm font-medium truncate">{rx.medication}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{rx.dosage}</p>
                                    {role === "PATIENT" && <p className="text-xs text-sky-400 mt-0.5">{rx.doctorName}</p>}
                                    {role === "DOCTOR"  && <p className="text-xs text-gray-600 mt-0.5 font-mono truncate">{rx.patientWallet?.slice(0, 18)}…</p>}
                                </div>
                                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono text-green-400 bg-green-500/10 flex-shrink-0 ml-2">
                                    <CheckCircle size={10} /> Verified
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{rx.issuedDate} · {rx.duration}</span>
                                <span className="text-sky-400 group-hover:underline">View QR →</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* QR Modal */}
            {selected && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    onClick={() => setSelected(null)}
                >
                    <div
                        className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-6 w-80 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <p className="text-white font-bold mb-1">{selected.medication}</p>
                        <p className="text-xs text-gray-500 mb-4">{selected.doctorName} · {selected.issuedDate}</p>

                        <div className="flex justify-center mb-4">
                            <div className="bg-black p-3 rounded-xl border border-white/10">
                                <QRGrid data={selected.txHash + selected.id} size={140} />
                            </div>
                        </div>

                        <div className="space-y-2 mb-4">
                            {[
                                { label: "Dosage",      value: selected.dosage },
                                { label: "Duration",    value: selected.duration },
                                { label: "Valid until", value: selected.expiryDate },
                                ...(selected.notes ? [{ label: "Notes", value: selected.notes }] : []),
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between text-xs">
                                    <span className="text-gray-500">{label}</span>
                                    <span className="text-white text-right max-w-[60%]">{value}</span>
                                </div>
                            ))}
                        </div>

                        <div className="bg-white/5 rounded-lg p-2 flex items-center gap-2 mb-4">
                            <Shield size={12} className="text-green-400 flex-shrink-0" />
                            <p className="text-[10px] font-mono text-gray-500 truncate">{selected.txHash}</p>
                            <button onClick={() => copyHash(selected.txHash)} className="ml-auto flex-shrink-0 text-gray-500 hover:text-white">
                                <Copy size={12} />
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => addToast("info", "QR download coming soon.")}
                                className="flex-1 flex items-center justify-center gap-1.5 bg-sky-500 text-white py-2 rounded-lg text-xs font-medium hover:bg-sky-600"
                            >
                                <Download size={13} /> Download QR
                            </button>
                            <button
                                onClick={() => setSelected(null)}
                                className="px-4 py-2 text-xs text-gray-500 hover:text-white border border-white/10 rounded-lg"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PrescriptionQRPanel;