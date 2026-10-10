import React, { useState, useEffect, useCallback } from "react";
import { FileText, Loader2, Plus, ShieldCheck, RefreshCw } from "./ui/Icons";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { MedicalRecord } from "../types";
import { createClaim as createFabricClaim, getPatientClaims } from "../services/fabricAccessService";

interface Claim {
    claimId: string;
    patientId: string;
    documentId: string;
    insuranceProviderId: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    updatedAt: string;
}

const STATUS_STYLE: Record<string, string> = {
    SUBMITTED:    "text-sky-500 border-sky-500/30 bg-sky-500/10",
    UNDER_REVIEW: "text-amber-500 border-amber-500/30 bg-amber-500/10",
    APPROVED:     "text-green-500 border-green-500/30 bg-green-500/10",
    DENIED:       "text-red-500 border-red-500/30 bg-red-500/10",
    PAID:         "text-teal-500 border-teal-500/30 bg-teal-500/10",
};

interface Props {
    patientWallet: string;
    records: MedicalRecord[];
}

/**
 * Patient-facing insurance claims panel.
 * Claims are created and tracked on the MediVault chaincode.
 */
const InsuranceClaimsPanel: React.FC<Props> = ({ patientWallet, records }) => {
    const { addToast } = useToast();
    const { theme } = useTheme();
    const dark = theme === "dark";

    const [claims, setClaims] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    // Create-claim form state
    const [docId, setDocId] = useState("");
    const [amount, setAmount] = useState("");
    const [provider, setProvider] = useState("");
    const [currency] = useState("INR");

    const card = dark ? "bg-[#0f0f0f] border-white/[0.08]" : "bg-white border-gray-200 shadow-sm";
    const tx   = dark ? "text-white" : "text-gray-900";
    const t2   = dark ? "text-gray-400" : "text-gray-500";
    const inp  = dark ? "bg-black/60 border-white/10 text-white placeholder-gray-600" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400";
    const dv   = dark ? "border-white/[0.06]" : "border-gray-200";

    const loadClaims = useCallback(async () => {
        setLoading(true);
        try {
            setClaims(await getPatientClaims(patientWallet));
        } catch (error: any) {
            setClaims([]);
            addToast("error", error?.message || "Could not load claims.");
        } finally {
            setLoading(false);
        }
    }, [patientWallet, addToast]);

    useEffect(() => { loadClaims(); }, [loadClaims]);

    const handleCreate = async () => {
        if (!docId) return addToast("error", "Select a document for the claim.");
        if (!amount || Number(amount) <= 0) return addToast("error", "Enter a valid claim amount.");
        if (!provider) return addToast("error", "Enter the insurance provider wallet.");

        setCreating(true);
        try {
            const claim = await createFabricClaim(patientWallet, {
                documentId: docId,
                insuranceProviderId: provider.toLowerCase(),
                amount,
                currency,
            });
            addToast("success", `Claim ${claim.claimId} submitted on the ledger.`);
            setAmount("");
            setProvider("");
            await loadClaims();
        } catch (error: any) {
            addToast("error", error?.message || "Failed to create claim.");
        } finally {
            setCreating(false);
        }
    };

    const statusLabel = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck size={16} className="text-teal-500" />
                    <h3 className={`text-sm font-bold ${tx}`}>Insurance claims</h3>
                </div>
                <p className={`text-xs ${t2}`}>
                    Submit a claim against one of your medical documents. Status changes are recorded on the blockchain.
                </p>
            </div>

            {/* Create claim */}
            <div className={`border rounded-xl p-5 ${card}`}>
                <h4 className={`text-xs font-bold uppercase tracking-wide mb-3 ${t2}`}>Submit a new claim</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                        <label className={`text-[10px] font-semibold uppercase mb-1 block ${t2}`}>Document</label>
                        <select value={docId} onChange={e => setDocId(e.target.value)} className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-teal-500 ${inp}`}>
                            <option value="">Select a document…</option>
                            {records.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={`text-[10px] font-semibold uppercase mb-1 block ${t2}`}>Amount (INR)</label>
                        <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="5000"
                               className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-teal-500 ${inp}`} />
                    </div>
                    <div>
                        <label className={`text-[10px] font-semibold uppercase mb-1 block ${t2}`}>Provider wallet</label>
                        <input value={provider} onChange={e => setProvider(e.target.value)} placeholder="0x…"
                               className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-teal-500 ${inp}`} />
                    </div>
                </div>
                <div className="mt-3 flex justify-end">
                    <button
                        onClick={handleCreate}
                        disabled={creating}
                        className="flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 transition-colors"
                    >
                        {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Submit claim
                    </button>
                </div>
            </div>

            {/* Claim list */}
            <div className={`border rounded-xl p-5 ${card}`}>
                <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-xs font-bold uppercase tracking-wide ${t2}`}>My claims</h4>
                    <button onClick={loadClaims} className="flex items-center gap-1 text-[10px] font-semibold text-teal-500 hover:text-teal-400">
                        <RefreshCw size={11} /> Refresh
                    </button>
                </div>

                {loading ? (
                    <div className={`text-center py-8 ${t2}`}>
                        <Loader2 size={16} className="mx-auto mb-2 animate-spin" />
                        <p className="text-xs">Loading claims…</p>
                    </div>
                ) : claims.length === 0 ? (
                    <p className={`text-sm py-6 text-center ${t2}`}>No claims yet.</p>
                ) : (
                    <div className="space-y-2">
                        {claims.map(claim => (
                            <div key={claim.claimId} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${dv}`}>
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
                                        <FileText size={14} className="text-teal-500" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className={`text-xs font-semibold ${tx}`}>{claim.claimId}</p>
                                        <p className={`text-[10px] ${t2} truncate`}>
                                            {claim.currency} {claim.amount} · doc {claim.documentId}
                                        </p>
                                    </div>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${STATUS_STYLE[claim.status] || ""}`}>
                                    {statusLabel(claim.status)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default InsuranceClaimsPanel;
