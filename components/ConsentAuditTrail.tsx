import React, { useState } from 'react';
import { ShieldCheck, Eye, Lock, ShieldOff, ExternalLink, Filter, Download } from './ui/Icons';
import { AccessLog } from '../types';
import { MOCK_ACCESS_LOGS } from '../services/mockData';
import { useToast } from '../context/ToastContext';

const actionConfig = {
    GRANTED: { label: 'Access granted', icon: <ShieldCheck size={14} />, color: 'text-green-400 bg-green-500/10 border-green-500/20' },
    REVOKED: { label: 'Access revoked', icon: <ShieldOff size={14} />, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
    ACCESSED: { label: 'Records accessed', icon: <Eye size={14} />, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
};

const ConsentAuditTrail: React.FC = () => {
    const { addToast } = useToast();
    const [logs] = useState<AccessLog[]>(MOCK_ACCESS_LOGS);
    const [filter, setFilter] = useState<'ALL' | 'GRANTED' | 'REVOKED' | 'ACCESSED'>('ALL');

    const filtered = filter === 'ALL' ? logs : logs.filter(l => l.action === filter);

    const exportLog = () => {
        addToast('info', 'Audit log export queued. You will receive it via email.');
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                        <ShieldCheck size={18} className="text-green-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold">Consent Audit Trail</h3>
                        <p className="text-xs text-gray-500">On-chain immutable access log · PDPB 2023 compliant</p>
                    </div>
                </div>
                <button
                    onClick={exportLog}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg hover:border-white/20 transition-all"
                >
                    <Download size={13} /> Export PDF
                </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-5">
                {(['ALL', 'GRANTED', 'ACCESSED', 'REVOKED'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                            filter === f
                                ? 'border-sky-500 text-sky-400 bg-sky-500/10'
                                : 'border-white/10 text-gray-500 hover:border-white/20'
                        }`}
                    >
                        {f === 'ALL' ? 'All events' : actionConfig[f].label}
                    </button>
                ))}
            </div>

            {/* Timeline */}
            <div className="relative">
                <div className="absolute left-[18px] top-0 bottom-0 w-px bg-white/5" />
                <div className="space-y-4">
                    {filtered.map((log, i) => {
                        const cfg = actionConfig[log.action];
                        return (
                            <div key={i} className="relative flex gap-4 pl-10">
                                {/* Dot */}
                                <div className={`absolute left-3 top-3 w-3 h-3 rounded-full border-2 ${
                                    log.action === 'GRANTED' ? 'bg-green-500 border-green-400' :
                                        log.action === 'REVOKED' ? 'bg-red-500 border-red-400' :
                                            'bg-sky-500 border-sky-400'
                                }`} />

                                {/* Card */}
                                <div className="flex-1 bg-black border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <p className="text-white text-sm font-medium">{log.doctorName}</p>
                                            <p className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                        </div>
                                        <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${cfg.color}`}>
                                            {cfg.icon} {cfg.label}
                                        </span>
                                    </div>

                                    {log.recordsAccessed && log.recordsAccessed.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-white/5">
                                            <p className="text-xs text-gray-500 mb-1">Records accessed:</p>
                                            <div className="flex flex-wrap gap-1">
                                                {log.recordsAccessed.map(r => (
                                                    <span key={r} className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full">{r}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {log.txHash && (
                                        <div className="mt-2 flex items-center gap-1.5">
                                            <Lock size={10} className="text-gray-600" />
                                            <span className="text-[10px] font-mono text-gray-600 truncate">{log.txHash}</span>
                                            <a
                                                href={`https://polygonscan.com/tx/${log.txHash}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="ml-auto flex-shrink-0 text-gray-600 hover:text-sky-400 transition-colors"
                                            >
                                                <ExternalLink size={11} />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-600">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No {filter.toLowerCase()} events found.</p>
                </div>
            )}
        </div>
    );
};

export default ConsentAuditTrail;