import React, { useState, useEffect, useCallback } from 'react';
import { QrCode, CheckCircle, Loader2, Copy, Download, Shield, Plus } from './ui/Icons';
import { useToast } from '../context/ToastContext';
import {
    createPrescription,
    getDoctorPrescriptions,
    getPatientPrescriptions,
    revokePrescription,
    FabricPrescription,
} from '../services/prescriptionService';
import { createNotification } from '../services/notificationService';

interface PrescriptionQRProps {
    role: 'DOCTOR' | 'PATIENT';
    /** Required when role === 'DOCTOR'. The authenticated doctor's wallet. */
    doctorWallet?: string;
    /**
     * Required when role === 'DOCTOR' — the currently selected patient, used
     * to scope the "New prescription" form and the list shown.
     * Required when role === 'PATIENT' — the authenticated patient's own wallet.
     */
    patientWallet?: string;
}

// Minimal deterministic QR grid generator (visual mock)
const QRGrid: React.FC<{ data: string; size?: number }> = ({ data, size = 120 }) => {
    const cells = 21;
    const cellSize = size / cells;
    const grid = Array.from({ length: cells }, (_, r) =>
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

const PrescriptionQRPanel: React.FC<PrescriptionQRProps> = ({ role, doctorWallet, patientWallet }) => {
    const { addToast } = useToast();

    const [prescriptions, setPrescriptions] = useState<FabricPrescription[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [selected, setSelected] = useState<FabricPrescription | null>(null);

    // ────────────────────────────────────────────────────────────
    // LOAD
    // ────────────────────────────────────────────────────────────

    const load = useCallback(async () => {
        if (role === 'DOCTOR') {
            if (!doctorWallet) return;
            setLoading(true);
            try {
                const data = await getDoctorPrescriptions(doctorWallet);
                setPrescriptions(
                    patientWallet
                        ? data.filter(
                            rx =>
                                rx.patientId?.toLowerCase() ===
                                patientWallet.toLowerCase()
                        )
                        : data
                );
            } catch (err: any) {
                addToast('error', err?.message || 'Could not load prescriptions.');
            } finally {
                setLoading(false);
            }
        } else {
            if (!patientWallet) return;
            setLoading(true);
            try {
                const data = await getPatientPrescriptions(patientWallet);
                setPrescriptions(data);
            } catch (err: any) {
                addToast('error', err?.message || 'Could not load prescriptions.');
            } finally {
                setLoading(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, doctorWallet, patientWallet]);

    useEffect(() => {
        load();
    }, [load]);

    // ────────────────────────────────────────────────────────────
    // DOCTOR: CREATE
    // ────────────────────────────────────────────────────────────

    const [form, setForm] = useState({
        diagnosis: '',
        medication: '',
        dosage: '',
        duration: '30 days',
        instructions: '',
        followUpDate: '',
    });
    const [generating, setGenerating] = useState(false);

    const generatePrescription = async () => {
        if (!doctorWallet) {
            addToast('error', 'Connecting wallet — try again in a moment.');
            return;
        }
        if (!patientWallet) {
            addToast('error', 'Select a patient first.');
            return;
        }
        if (!form.diagnosis || !form.medication || !form.dosage) {
            addToast('error', 'Please fill diagnosis, medication, and dosage.');
            return;
        }

        setGenerating(true);
        try {
            await createPrescription(doctorWallet, {
                patientWallet: patientWallet.toLowerCase(),
                diagnosis: form.diagnosis,
                medicines: [{ name: form.medication, dosage: form.dosage, duration: form.duration }],
                instructions: form.instructions,
                followUpDate: form.followUpDate,
            });

            // Notifications are intentionally best-effort: a notification
            // failure must never make a successful Fabric prescription look failed.
            void createNotification({
                recipientWallet: patientWallet.toLowerCase(),
                actorWallet: doctorWallet,
                type: 'PRESCRIPTION',
                title: 'New prescription',
                message:
                    `${form.medication} · ${form.dosage} · ${form.duration} ` +
                    `issued by ${doctorWallet.slice(0, 10)}…${doctorWallet.slice(-4)}.`,
                metadata: {
                    patientWallet: patientWallet.toLowerCase(),
                    doctorWallet: doctorWallet.toLowerCase(),
                    medication: form.medication,
                    dosage: form.dosage,
                    duration: form.duration,
                },
            });

            addToast('success', 'Prescription issued and visible to the patient.');
            setShowForm(false);
            setForm({ diagnosis: '', medication: '', dosage: '', duration: '30 days', instructions: '', followUpDate: '' });
            await load();
        } catch (err: any) {
            addToast('error', err?.message || 'Could not issue prescription.');
        } finally {
            setGenerating(false);
        }
    };

    const handleRevoke = async (rx: FabricPrescription) => {
        if (!doctorWallet) return;
        try {
            await revokePrescription(doctorWallet, rx.prescriptionId);

            void createNotification({
                recipientWallet: rx.patientId,
                actorWallet: doctorWallet,
                type: 'PRESCRIPTION',
                title: 'Prescription revoked',
                message:
                    `Prescription ${rx.prescriptionId.slice(0, 12)}… was revoked by ` +
                    `${doctorWallet.slice(0, 10)}…${doctorWallet.slice(-4)}.`,
                metadata: {
                    patientWallet: rx.patientId,
                    doctorWallet: doctorWallet.toLowerCase(),
                    prescriptionId: rx.prescriptionId,
                    action: 'REVOKED',
                },
            });

            addToast('success', 'Prescription revoked.');
            setSelected(null);
            await load();
        } catch (err: any) {
            addToast('error', err?.message || 'Could not revoke prescription.');
        }
    };

    const copyId = (id: string) => {
        navigator.clipboard.writeText(id);
        addToast('success', 'Prescription ID copied.');
    };

    // ────────────────────────────────────────────────────────────
    // RENDER
    // ────────────────────────────────────────────────────────────

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-sky-500/10 rounded-lg">
                        <QrCode size={18} className="text-sky-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold">Prescriptions</h3>
                        <p className="text-xs text-gray-500">Blockchain-signed · Tamper-proof · Pharmacist-verifiable</p>
                    </div>
                </div>
                {role === 'DOCTOR' && (
                    <button
                        onClick={() => setShowForm(!showForm)}
                        disabled={!patientWallet}
                        title={!patientWallet ? 'Select a patient first' : undefined}
                        className="flex items-center gap-1.5 bg-sky-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        <Plus size={14} /> New prescription
                    </button>
                )}
            </div>

            {/* Doctor form */}
            {role === 'DOCTOR' && showForm && (
                <div className="mb-6 bg-white/5 rounded-xl border border-white/10 p-5">
                    <p className="text-sm font-medium text-white mb-4">New Prescription</p>
                    <div className="mb-4">
                        <label className="block text-xs text-gray-400 mb-1">Diagnosis</label>
                        <input
                            type="text"
                            value={form.diagnosis}
                            onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
                            placeholder="e.g. Hypertension"
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Medication</label>
                            <input
                                type="text"
                                value={form.medication}
                                onChange={e => setForm(f => ({ ...f, medication: e.target.value }))}
                                placeholder="Drug name, strength"
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Duration</label>
                            <select
                                value={form.duration}
                                onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                            >
                                {['7 days', '14 days', '30 days', '60 days', '90 days'].map(d => <option key={d}>{d}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="mb-4">
                        <label className="block text-xs text-gray-400 mb-1">Dosage instructions</label>
                        <input
                            type="text"
                            value={form.dosage}
                            onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))}
                            placeholder="e.g. 1 tablet twice daily after meals"
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Additional instructions (optional)</label>
                            <input
                                type="text"
                                value={form.instructions}
                                onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                                placeholder="e.g. Avoid alcohol"
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Follow-up date (optional)</label>
                            <input
                                type="date"
                                value={form.followUpDate}
                                onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))}
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                            />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={generatePrescription}
                            disabled={generating}
                            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-all"
                        >
                            {generating ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                            {generating ? 'Writing to chain...' : 'Sign & notarize on-chain'}
                        </button>
                        <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-white">Cancel</button>
                    </div>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="text-center py-10">
                    <Loader2 size={20} className="animate-spin mx-auto text-sky-400" />
                </div>
            ) : prescriptions.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
                    <p className="text-sm text-gray-500">
                        {role === 'PATIENT'
                            ? 'No prescriptions yet.'
                            : patientWallet
                                ? 'No prescriptions issued to this patient yet.'
                                : 'Select a patient to view or issue prescriptions.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {prescriptions.map(rx => {
                        const primary = rx.medicines[0];
                        return (
                            <div
                                key={rx.prescriptionId}
                                onClick={() => setSelected(rx)}
                                className="bg-black border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-sky-500/50 transition-all group"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <p className="text-white text-sm font-medium">{primary?.name}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{primary?.dosage}</p>
                                    </div>
                                    <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono ${rx.status === 'ACTIVE' ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                                        <CheckCircle size={10} /> {rx.status === 'ACTIVE' ? 'Active' : 'Revoked'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span>{new Date(rx.issuedAt).toLocaleDateString()} · {primary?.duration}</span>
                                    <span className="text-sky-400 group-hover:underline">View →</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Detail Modal */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSelected(null)}>
                    <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-1">
                            <p className="text-white font-bold">{selected.medicines[0]?.name}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono flex-shrink-0 ${selected.status === 'ACTIVE' ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                                {selected.status === 'ACTIVE' ? 'Active' : 'Revoked'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">{selected.diagnosis} · {new Date(selected.issuedAt).toLocaleDateString()}</p>

                        <div className="flex justify-center mb-4">
                            <div className="bg-black p-3 rounded-xl border border-white/10">
                                <QRGrid data={selected.prescriptionId} size={140} />
                            </div>
                        </div>

                        <div className="space-y-2 mb-4">
                            {selected.medicines.map((m, i) => (
                                <div key={i} className="flex justify-between text-xs">
                                    <span className="text-gray-500">{m.name}</span>
                                    <span className="text-white">{m.dosage} · {m.duration}</span>
                                </div>
                            ))}
                            {selected.instructions && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Instructions</span>
                                    <span className="text-white text-right">{selected.instructions}</span>
                                </div>
                            )}
                            {selected.followUpDate && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Follow-up</span>
                                    <span className="text-white">{selected.followUpDate}</span>
                                </div>
                            )}
                        </div>

                        <div className="bg-white/5 rounded-lg p-2 flex items-center gap-2 mb-4">
                            <Shield size={12} className="text-green-400 flex-shrink-0" />
                            <p className="text-[10px] font-mono text-gray-500 truncate">{selected.prescriptionId}</p>
                            <button onClick={() => copyId(selected.prescriptionId)} className="ml-auto flex-shrink-0 text-gray-500 hover:text-white">
                                <Copy size={12} />
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => { addToast('info', 'QR download feature coming soon.'); }}
                                className="flex-1 flex items-center justify-center gap-1.5 bg-sky-500 text-white py-2 rounded-lg text-xs font-medium hover:bg-sky-600"
                            >
                                <Download size={13} /> Download QR
                            </button>
                            {role === 'DOCTOR' && selected.status === 'ACTIVE' && (
                                <button
                                    onClick={() => handleRevoke(selected)}
                                    className="px-3 py-2 text-xs font-medium rounded-lg border text-red-400 border-red-500/30 hover:bg-red-500/10"
                                >
                                    Revoke
                                </button>
                            )}
                            <button onClick={() => setSelected(null)} className="px-4 py-2 text-xs text-gray-500 hover:text-white border border-white/10 rounded-lg">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PrescriptionQRPanel;