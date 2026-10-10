import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, ShieldAlert, ShieldOff, Loader2, Clock, ExternalLink, Filter } from "./ui/Icons";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { MedicalRecord } from "../types";
import { getAuditHistory, FabricAuditEvent } from "../services/fabricAccessService";

interface Props {
    patientWallet: string;
    records: MedicalRecord[];
}

const ACTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    DOCUMENT_CREATED:           { label: "Record created",     icon: <ShieldCheck size={14} />,   color: "text-sky-500 border-sky-500/30 bg-sky-500/10" },
    DOCUMENT_ACCESS_GRANTED:    { label: "Access granted",     icon: <ShieldCheck size={14} />,   color: "text-green-500 border-green-500/30 bg-green-500/10" },
    DOCUMENT_ACCESS_REVOKED:    { label: "Access revoked",     icon: <ShieldOff size={14} />,     color: "text-red-500 border-red-500/30 bg-red-500/10" },
    DOCUMENT_ACCESS_DENIED:     { label: "Access denied",      icon: <ShieldAlert size={14} />,   color: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
    DOCUMENT_VIEWED:            { label: "Record viewed",      icon: <ShieldCheck size={14} />,   color: "text-purple-500 border-purple-500/30 bg-purple-500/10" },
    CLAIM_SUBMITTED:            { label: "Claim submitted",    icon: <ShieldCheck size={14} />,   color: "text-teal-500 border-teal-500/30 bg-teal-500/10" },
    CLAIM_STATUS_UPDATED:       { label: "Claim status",       icon: <ShieldCheck size={14} />,   color: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
};

const FabricAuditPanel: React.FC<Props> = ({ patientWallet, records }) => {
    const { addToast } = useToast();
    const { theme } = useTheme();
    const dark = theme === "dark";

    const [selectedDoc, setSelectedDoc] = useState("");
    const [events, setEvents] = useState<FabricAuditEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<string>("ALL");

    const tx   = dark ? "text-white" : "text-gray-900";
    const t2   = dark ? "text-gray-400" : "text-gray-500";
    const card = dark ? "bg-[#0f0f0f] border-white/[0.08]" : "bg-white border-gray-200 shadow-sm";
    const inp  = dark ? "bg-black/60 border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900";
    const dv   = dark ? "border-white/[0.06]" : "border-gray-200";

    const loadEvents = useCallback(async (documentId: string) => {
        if (!documentId) return;
        setLoading(true);
        setEvents([]);
        try {
            const history = await getAuditHistory(patientWallet, documentId);
            setEvents(history);
        } catch (error: any) {
            addToast("error", error?.message || "Could not load audit history.");
        } finally {
            setLoading(false);
        }
    }, [patientWallet, addToast]);

    const filtered = filter === "ALL" ? events : events.filter(e => e.action === filter);

    return (
        <div>
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-green-500/10 rounded-lg"><ShieldCheck size={16} className="text-green-500" /></div>
                    <div>
                        <h3 className={`font-bold text-sm ${tx}`}>Consent Audit Trail</h3>
                        <p className={`text-[10px] ${t2}`}>Immutable on-chain event history · PDPB 2023</p>
                    </div>
                </div>
            </div>

            <div className="mb-4">
                <label className={`text-[11px] font-semibold uppercase tracking-wide mb-1 block ${t2}`}>Document</label>
                <select
                    value={selectedDoc}
                    onChange={(e) => { setSelectedDoc(e.target.value); loadEvents(e.target.value); }}
                    className={`w-full max-w-sm rounded-lg border px-3 py-2 text-sm focus:outline-none focus:border-green-500 ${inp}`}
                >
                    <option value="">Select a document…</option>
                    {records.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                </select>
            </div>

            <div className="flex gap-2 mb-4 flex-wrap">
                {(["ALL", "DOCUMENT_ACCESS_GRANTED", "DOCUMENT_VIEWED", "DOCUMENT_ACCESS_REVOKED", "DOCUMENT_ACCESS_DENIED"] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                            filter === f ? "border-green-500 text-green-500 bg-green-500/10"
                                : `${dv} ${t2} hover:border-green-500/30`
                        }`}
                    >
                        {f === "ALL" ? "All events" : ACTION_CONFIG[f]?.label || f}
                    </button>
                ))}
            </div>

            {!selectedDoc ? (
                <div className={`text-center py-10 ${t2}`}>
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Select a document to view its audit trail.</p>
                </div>
            ) : loading ? (
                <div className={`text-center py-10 ${t2}`}>
                    <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                    <p className="text-xs">Loading audit history from Fabric…</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className={`text-center py-10 ${t2}`}>
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No events found for this filter.</p>
                </div>
            ) : (
                <div className="relative">
                    <div className={`absolute left-[18px] top-0 bottom-0 w-px ${dark ? "bg-white/5" : "bg-gray-100"}`} />
                    <div className="space-y-4">
                        {filtered.map(ev => {
                            const cfg = ACTION_CONFIG[ev.action] || { label: ev.action, icon: <ShieldCheck size={14} />, color: "text-gray-500 border-gray-500/30 bg-gray-500/10" };
                            return (
                                <div key={ev.eventId} className="relative flex gap-4 pl-10">
                                    <div className={`absolute left-3 top-3 w-3 h-3 rounded-full border-2 ${ev.action.includes("GRANTED") ? "bg-green-500 border-green-400" : ev.action.includes("REVOKED") ? "bg-red-500 border-red-400" : ev.action.includes("DENIED") ? "bg-amber-500 border-amber-400" : "bg-sky-500 border-sky-400"}`} />
                                    <div className={`flex-1 border rounded-xl p-4 ${card}`}>
                                        <div className="flex items-start justify-between gap-3 mb-1">
                                            <div>
                                                <p className={`text-xs font-semibold ${tx}`}>{ev.details || cfg.label}</p>
                                                <p className={`text-[10px] ${t2}`}>
                                                    {new Date(ev.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                                                </p>
                                            </div>
                                            <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.color}`}>
                                                {cfg.icon} {cfg.label}
                                            </span>
                                        </div>
                                        {ev.doctorId && ev.doctorId !== "" && (
                                            <p className={`text-[10px] ${t2} mt-1`}>
                                                Doctor: {ev.doctorId.slice(0, 10)}…
                                            </p>
                                        )}
                                        {ev.transactionId && (
                                            <div className={`mt-2 pt-2 border-t ${dv}`}>
                                                <span className={`text-[9px] font-mono ${t2}`}>tx: {ev.transactionId.slice(0, 16)}…</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FabricAuditPanel;
