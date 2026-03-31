import React, { useState } from 'react';
import { ShieldAlert, Clock, AlertTriangle, CheckCircle, Loader2, X } from './ui/Icons';
import { useToast } from '../context/ToastContext';
import { BreakGlassRequest } from '../types';

const BreakGlassAccess: React.FC<{ patientWallet: string }> = ({ patientWallet }) => {
    const { addToast } = useToast();
    const [reason, setReason] = useState('');
    const [requesting, setRequesting] = useState(false);
    const [activeRequest, setActiveRequest] = useState<BreakGlassRequest | null>(null);
    const [timeLeft, setTimeLeft] = useState(900); // 15 min in seconds
    const timerRef = React.useRef<NodeJS.Timeout | null>(null);
    const [confirmed, setConfirmed] = useState(false);

    const requestAccess = async () => {
        if (!reason.trim()) {
            addToast('error', 'A valid reason is required for emergency access.');
            return;
        }
        setRequesting(true);
        await new Promise(r => setTimeout(r, 1800)); // Simulate blockchain write

        const req: BreakGlassRequest = {
            id: 'bg_' + Date.now(),
            doctorId: 'doc_001',
            doctorName: 'Dr. Sunita Mehta',
            reason,
            requestedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            approved: true,
            patientWallet,
        };

        setActiveRequest(req);
        setRequesting(false);
        setTimeLeft(900);
        setConfirmed(false);

        timerRef.current = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(timerRef.current!);
                    setActiveRequest(null);
                    addToast('info', 'Emergency access expired. Access has been automatically revoked.');
                    return 0;
                }
                return t - 1;
            });
        }, 1000);

        addToast('warning', 'Emergency access granted for 15 minutes. All activity is being logged on-chain.');
    };

    const revokeEarly = () => {
        clearInterval(timerRef.current!);
        setActiveRequest(null);
        setReason('');
        addToast('success', 'Emergency access revoked manually. Log written to chain.');
    };

    const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    return (
        <div className="max-w-lg">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-red-500/10 rounded-lg">
                    <ShieldAlert size={18} className="text-red-400" />
                </div>
                <div>
                    <h3 className="text-white font-bold">Emergency Break-Glass Access</h3>
                    <p className="text-xs text-gray-500">15-min override · Immutably logged on Polygon · Auto-revoked</p>
                </div>
            </div>

            <div className="my-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                    <p className="text-red-300 text-sm font-medium">For emergency use only</p>
                    <p className="text-xs text-red-400/70 mt-1">This action creates an immutable on-chain audit trail and notifies the patient. Use only in genuine clinical emergencies where the patient is unable to grant access.</p>
                </div>
            </div>

            {!activeRequest ? (
                <div>
                    <div className="mb-4">
                        <label className="block text-xs text-gray-400 mb-1.5">Clinical emergency reason (required)</label>
                        <textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="e.g. Patient is unconscious and requires immediate assessment of prior cardiac history for emergency intervention."
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500 resize-none h-24"
                        />
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                        <input
                            type="checkbox"
                            id="confirm"
                            checked={confirmed}
                            onChange={e => setConfirmed(e.target.checked)}
                            className="w-4 h-4 accent-red-500"
                        />
                        <label htmlFor="confirm" className="text-xs text-gray-400">
                            I confirm this is a genuine medical emergency and understand all access will be permanently logged
                        </label>
                    </div>

                    <button
                        onClick={requestAccess}
                        disabled={requesting || !confirmed || !reason.trim()}
                        className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                    >
                        {requesting ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
                        {requesting ? 'Writing to blockchain…' : 'Activate emergency access'}
                    </button>
                </div>
            ) : (
                <div>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 mb-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-red-400 text-sm font-medium">Emergency access active</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-black/40 rounded-full px-3 py-1">
                                <Clock size={12} className="text-red-400" />
                                <span className="text-red-300 font-mono text-sm">{formatTime(timeLeft)}</span>
                            </div>
                        </div>
                        <p className="text-xs text-red-400/70 mb-3">Reason: {activeRequest.reason}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-mono">
                            <CheckCircle size={10} className="text-green-400" />
                            On-chain log: {activeRequest.id}
                        </div>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4">
                        <p className="text-xs text-amber-300">Full vault access is now active. All records accessed during this session will be permanently logged. Access expires at {new Date(activeRequest.expiresAt).toLocaleTimeString('en-IN')}.</p>
                    </div>

                    <button
                        onClick={revokeEarly}
                        className="flex items-center gap-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 px-5 py-2 rounded-lg text-sm font-medium transition-all"
                    >
                        <X size={14} /> Revoke access early
                    </button>
                </div>
            )}
        </div>
    );
};

export default BreakGlassAccess;