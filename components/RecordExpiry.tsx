import React from 'react';
import { AlertTriangle, CheckCircle, Clock, X, Bell } from './ui/Icons';
import { MedicalRecord, HealthAlert } from '../types';
import { MOCK_HEALTH_ALERTS } from '../services/mockData';

interface RecordExpiryProps {
    records: MedicalRecord[];
    alerts?: HealthAlert[];
}

const getDaysUntilExpiry = (expiryDate?: string): number | null => {
    if (!expiryDate) return null;
    const diff = new Date(expiryDate).getTime() - Date.now();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const ExpiryBadge: React.FC<{ days: number | null }> = ({ days }) => {
    if (days === null) return null;
    if (days < 0) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Expired {Math.abs(days)}d ago</span>;
    if (days <= 30) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Expires in {days}d</span>;
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Valid</span>;
};

const RecordExpiry: React.FC<RecordExpiryProps> = ({ records, alerts = MOCK_HEALTH_ALERTS }) => {
    const expiredOrSoon = records.filter(r => {
        const d = getDaysUntilExpiry(r.expiryDate);
        return d !== null && d <= 30;
    });

    const unread = alerts.filter(a => !a.read);

    return (
        <div>
            <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                    <Bell size={18} className="text-amber-400" />
                </div>
                <div>
                    <h3 className="text-white font-bold">Alerts & Expiry</h3>
                    <p className="text-xs text-gray-500">{unread.length} unread · {expiredOrSoon.length} records need attention</p>
                </div>
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
                <div className="mb-6">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Health alerts</p>
                    <div className="space-y-2">
                        {alerts.map(alert => (
                            <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                                alert.type === 'CRITICAL' ? 'bg-red-500/10 border-red-500/20' :
                                    alert.type === 'WARNING' ? 'bg-amber-500/10 border-amber-500/20' :
                                        'bg-sky-500/10 border-sky-500/20'
                            } ${!alert.read ? 'opacity-100' : 'opacity-50'}`}>
                                {alert.type === 'CRITICAL' ? <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" /> :
                                    alert.type === 'WARNING' ? <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" /> :
                                        <Bell size={14} className="text-sky-400 mt-0.5 flex-shrink-0" />}
                                <div className="flex-1">
                                    <p className={`text-sm ${alert.type === 'CRITICAL' ? 'text-red-300' : alert.type === 'WARNING' ? 'text-amber-300' : 'text-sky-300'}`}>{alert.message}</p>
                                    <p className="text-xs text-gray-600 mt-1">{new Date(alert.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                </div>
                                {!alert.read && <div className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0 mt-1.5" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Record expiry table */}
            <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Document expiry status</p>
                <div className="space-y-2">
                    {records.map(r => {
                        const days = getDaysUntilExpiry(r.expiryDate);
                        return (
                            <div key={r.id} className="flex items-center justify-between bg-black border border-gray-800 rounded-xl px-4 py-3 hover:border-gray-700 transition-all">
                                <div className="flex items-center gap-3">
                                    {days !== null && days < 0 ? (
                                        <AlertTriangle size={14} className="text-red-400" />
                                    ) : days !== null && days <= 30 ? (
                                        <Clock size={14} className="text-amber-400" />
                                    ) : (
                                        <CheckCircle size={14} className="text-green-400" />
                                    )}
                                    <div>
                                        <p className="text-sm text-white">{r.name}</p>
                                        <p className="text-xs text-gray-500">{r.category} · {r.date}</p>
                                    </div>
                                </div>
                                <ExpiryBadge days={days} />
                            </div>
                        );
                    })}
                </div>
            </div>

            {expiredOrSoon.length > 0 && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-300">
                        {expiredOrSoon.length} record(s) need renewal. Visit your healthcare provider to obtain updated documents.
                    </p>
                </div>
            )}
        </div>
    );
};

export default RecordExpiry;