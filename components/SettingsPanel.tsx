import React, { useState } from 'react';
import {
    User, Lock, Bell, ShieldCheck, Settings, Sun, Moon,
    LogOut, X, Wallet, AlertTriangle, Download, Fingerprint
} from './ui/Icons';
import { UserRole } from '../types';
import { useToast } from '../context/ToastContext';

interface SettingsPanelProps {
    role: UserRole;
    walletAddress: string;
    onClose?: () => void;
}

type Section = 'profile' | 'security' | 'notifications' | 'privacy' | 'appearance';

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
    <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-sky-500' : 'bg-gray-600'}`}
    >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
);

const ToggleRow: React.FC<{ label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, sub, checked, onChange }) => (
    <div className="flex items-center justify-between py-3 border-b border-white/5">
        <div>
            <p className="text-sm text-white">{label}</p>
            {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <Toggle checked={checked} onChange={onChange} />
    </div>
);

const InputField: React.FC<{ label: string; value: string; onChange: (v: string) => void; disabled?: boolean }> = ({ label, value, onChange, disabled }) => (
    <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={disabled}
            className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
    </div>
);

const SettingsPanel: React.FC<SettingsPanelProps> = ({ role, walletAddress, onClose }) => {
    const { addToast } = useToast();
    const isPatient = role === UserRole.PATIENT;

    const [section, setSection] = useState<Section>('profile');
    const [saved, setSaved] = useState(false);

    // Profile
    const [profileData, setProfileData] = useState(
        isPatient
            ? { fullName: 'Rajesh Kumar', abhaId: 'ABHA-2912-3847-1923', dob: '14 Aug 1985', bloodGroup: 'O+', emergencyContact: '+91 98765 43210' }
            : { fullName: 'Dr. Sunita Mehta', specialization: 'Cardiologist', hospital: 'Apollo Hospitals, Mumbai', licenseNo: 'MCI-2023-8821', consultationHours: 'Mon–Fri, 10am–5pm' }
    );

    // Security
    const [security, setSecurity] = useState({ biometric: true, twoFactor: true, loginNotifs: false, autoLock: true, sessionTimeout: true, breakGlass: false });

    // Notifications
    const [notifs, setNotifs] = useState({ appointments: true, newRecord: true, accessAlerts: true, blockchainConfirm: false, prescription: true, digest: false, criticalVitals: true });

    // Privacy
    const [privacy, setPrivacy] = useState({ researchSharing: false, emergencyVitals: true, abdmSync: true, doctorDirectory: true });

    // Appearance
    const [theme, setTheme] = useState<'system' | 'dark' | 'light'>('dark');
    const [accent, setAccent] = useState('#0EA5E9');

    const handleSave = () => {
        setSaved(true);
        addToast('success', 'Settings saved successfully');
        setTimeout(() => setSaved(false), 2000);
    };

    const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
        { id: 'profile', label: 'Profile', icon: <User size={15} /> },
        { id: 'security', label: 'Security', icon: <Lock size={15} /> },
        { id: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
        { id: 'privacy', label: 'Privacy', icon: <ShieldCheck size={15} /> },
        { id: 'appearance', label: 'Appearance', icon: <Settings size={15} /> },
    ];

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <h2 className="text-white font-bold text-lg">Settings</h2>
                {onClose && (
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                )}
            </div>

            {/* Wallet pill */}
            <div className="px-6 py-3 border-b border-white/5">
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                    <Wallet size={13} className="text-sky-400" />
                    <span className="text-xs text-gray-400 font-mono truncate">{walletAddress}</span>
                    <span className="ml-auto text-[10px] text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">Connected</span>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar nav */}
                <div className="w-44 border-r border-white/5 py-3 flex-shrink-0">
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setSection(item.id)}
                            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left ${
                                section === item.id
                                    ? 'text-white bg-white/5 border-r-2 border-sky-500'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                    <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:text-red-400 transition-colors mt-4 border-t border-white/5 pt-4">
                        <LogOut size={15} />
                        Disconnect
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-5 py-4">

                    {/* PROFILE */}
                    {section === 'profile' && (
                        <div>
                            <div className="flex items-center gap-3 mb-5">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${isPatient ? 'bg-sky-500/20 text-sky-400' : 'bg-green-500/20 text-green-400'}`}>
                                    {isPatient ? 'RK' : 'SM'}
                                </div>
                                <div>
                                    <p className="text-white text-sm font-medium">{profileData.fullName}</p>
                                    <p className="text-xs text-gray-500">{isPatient ? 'Patient' : 'Verified Doctor'}</p>
                                </div>
                                <button className="ml-auto text-xs text-sky-400 hover:text-sky-300">Change photo</button>
                            </div>
                            {isPatient ? (
                                <>
                                    <InputField label="Full name" value={(profileData as any).fullName} onChange={v => setProfileData(p => ({...p, fullName: v}))} />
                                    <InputField label="ABHA ID" value={(profileData as any).abhaId} onChange={v => setProfileData(p => ({...p, abhaId: v}))} />
                                    <InputField label="Date of birth" value={(profileData as any).dob} onChange={v => setProfileData(p => ({...p, dob: v}))} />
                                    <InputField label="Blood group" value={(profileData as any).bloodGroup} onChange={v => setProfileData(p => ({...p, bloodGroup: v}))} />
                                    <InputField label="Emergency contact" value={(profileData as any).emergencyContact} onChange={v => setProfileData(p => ({...p, emergencyContact: v}))} />
                                </>
                            ) : (
                                <>
                                    <InputField label="Full name" value={(profileData as any).fullName} onChange={v => setProfileData(p => ({...p, fullName: v}))} />
                                    <InputField label="Specialization" value={(profileData as any).specialization} onChange={v => setProfileData(p => ({...p, specialization: v}))} />
                                    <InputField label="Hospital / Clinic" value={(profileData as any).hospital} onChange={v => setProfileData(p => ({...p, hospital: v}))} />
                                    <InputField label="MCI License" value={(profileData as any).licenseNo} onChange={() => {}} disabled />
                                    <InputField label="Consultation hours" value={(profileData as any).consultationHours} onChange={v => setProfileData(p => ({...p, consultationHours: v}))} />
                                </>
                            )}
                        </div>
                    )}

                    {/* SECURITY */}
                    {section === 'security' && (
                        <div>
                            <ToggleRow label="Biometric unlock" sub="Fingerprint or Face ID" checked={security.biometric} onChange={v => setSecurity(s => ({...s, biometric: v}))} />
                            <ToggleRow label="Two-factor authentication" sub="OTP via registered mobile" checked={security.twoFactor} onChange={v => setSecurity(s => ({...s, twoFactor: v}))} />
                            <ToggleRow label="Login notifications" sub="SMS alerts on new login" checked={security.loginNotifs} onChange={v => setSecurity(s => ({...s, loginNotifs: v}))} />
                            <ToggleRow label="Auto-lock vault" sub="Lock after 5 min inactivity" checked={security.autoLock} onChange={v => setSecurity(s => ({...s, autoLock: v}))} />
                            {!isPatient && (
                                <>
                                    <ToggleRow label="Smart contract permission alerts" sub="Notify on any on-chain access event" checked={security.sessionTimeout} onChange={v => setSecurity(s => ({...s, sessionTimeout: v}))} />
                                    <ToggleRow
                                        label="Break-glass emergency access"
                                        sub="15-min override with mandatory reason log"
                                        checked={security.breakGlass}
                                        onChange={v => {
                                            setSecurity(s => ({...s, breakGlass: v}));
                                            if (v) addToast('warning', 'Break-glass mode enabled. All access will be logged on-chain.');
                                        }}
                                    />
                                </>
                            )}
                            <div className="mt-4 pt-4 border-t border-white/5">
                                <p className="text-xs text-gray-500 mb-2">Connected wallet</p>
                                <div className="bg-black/50 rounded-lg px-3 py-2 font-mono text-xs text-gray-400">{walletAddress}</div>
                                <button
                                    className="mt-3 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                                    onClick={() => addToast('info', 'Wallet disconnection requires a page reload.')}
                                >
                                    <AlertTriangle size={12} /> Disconnect wallet
                                </button>
                            </div>
                            <div className="mt-4 pt-4 border-t border-white/5">
                                <p className="text-xs text-gray-500 mb-2">Audit log</p>
                                <button
                                    onClick={() => addToast('info', 'Audit log export queued — you will receive it via email.')}
                                    className="flex items-center gap-2 text-xs text-sky-400 hover:text-sky-300"
                                >
                                    <Download size={13} /> Export full access log (PDF)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* NOTIFICATIONS */}
                    {section === 'notifications' && (
                        <div>
                            <ToggleRow label="Appointment reminders" sub="24h and 1h before" checked={notifs.appointments} onChange={v => setNotifs(n => ({...n, appointments: v}))} />
                            <ToggleRow label="New record added to vault" checked={notifs.newRecord} onChange={v => setNotifs(n => ({...n, newRecord: v}))} />
                            <ToggleRow label="Doctor access grant / revoke" checked={notifs.accessAlerts} onChange={v => setNotifs(n => ({...n, accessAlerts: v}))} />
                            <ToggleRow label="Blockchain notarization confirmed" checked={notifs.blockchainConfirm} onChange={v => setNotifs(n => ({...n, blockchainConfirm: v}))} />
                            {isPatient ? (
                                <>
                                    <ToggleRow label="Prescription ready to collect" checked={notifs.prescription} onChange={v => setNotifs(n => ({...n, prescription: v}))} />
                                    <ToggleRow label="Weekly health summary digest" checked={notifs.digest} onChange={v => setNotifs(n => ({...n, digest: v}))} />
                                    <ToggleRow label="Record expiry alerts" sub="30 days before document expiry" checked={true} onChange={() => {}} />
                                </>
                            ) : (
                                <>
                                    <ToggleRow label="Critical vitals alert" sub="When patient shares a critical reading" checked={notifs.criticalVitals} onChange={v => setNotifs(n => ({...n, criticalVitals: v}))} />
                                    <ToggleRow label="Daily patient summary" checked={notifs.digest} onChange={v => setNotifs(n => ({...n, digest: v}))} />
                                    <ToggleRow label="New patient access request" checked={true} onChange={() => {}} />
                                </>
                            )}
                        </div>
                    )}

                    {/* PRIVACY */}
                    {section === 'privacy' && (
                        <div>
                            {isPatient ? (
                                <>
                                    <ToggleRow label="Anonymised research data sharing" sub="Opt-in to contribute to health research" checked={privacy.researchSharing} onChange={v => setPrivacy(p => ({...p, researchSharing: v}))} />
                                    <ToggleRow label="Share vitals with emergency contacts" checked={privacy.emergencyVitals} onChange={v => setPrivacy(p => ({...p, emergencyVitals: v}))} />
                                    <ToggleRow label="Sync with ABDM national registry" sub="Requires ABHA ID" checked={privacy.abdmSync} onChange={v => setPrivacy(p => ({...p, abdmSync: v}))} />
                                    <div className="mt-4">
                                        <label className="block text-xs text-gray-400 mb-1.5">Data retention policy</label>
                                        <select className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500">
                                            <option>Keep records indefinitely</option>
                                            <option>Delete after 10 years</option>
                                            <option>Delete after 5 years</option>
                                        </select>
                                    </div>
                                    <button
                                        className="mt-4 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                                        onClick={() => addToast('info', 'PDPB data deletion request submitted. You will be contacted within 30 days.')}
                                    >
                                        <AlertTriangle size={12} /> Request data deletion (PDPB 2023)
                                    </button>
                                </>
                            ) : (
                                <>
                                    <ToggleRow label="Visible in doctor discovery" sub="Patients can find and book you" checked={privacy.doctorDirectory} onChange={v => setPrivacy(p => ({...p, doctorDirectory: v}))} />
                                    <ToggleRow label="Share aggregated stats with hospital" checked={false} onChange={() => {}} />
                                    <ToggleRow label="Allow telemedicine session recording" sub="With patient consent only" checked={false} onChange={() => {}} />
                                    <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                        <p className="text-xs text-amber-400">All patient data access is immutably logged on-chain per PDPB 2023. You cannot modify or delete access logs.</p>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* APPEARANCE */}
                    {section === 'appearance' && (
                        <div>
                            <p className="text-xs text-gray-400 mb-2">Theme</p>
                            <div className="flex gap-2 mb-5">
                                {(['dark', 'light', 'system'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setTheme(t)}
                                        className={`flex-1 py-2 text-xs rounded-lg border capitalize transition-colors ${theme === t ? 'border-sky-500 text-sky-400 bg-sky-500/10' : 'border-white/10 text-gray-500 hover:border-white/20'}`}
                                    >
                                        {t === 'dark' ? '🌙' : t === 'light' ? '☀️' : '⚙️'} {t}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-gray-400 mb-2">Accent color</p>
                            <div className="flex gap-2 mb-5">
                                {['#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444'].map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setAccent(c)}
                                        style={{ background: c }}
                                        className={`w-7 h-7 rounded-full transition-transform ${accent === c ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110' : ''}`}
                                    />
                                ))}
                            </div>
                            <p className="text-xs text-gray-400 mb-2">Dashboard density</p>
                            <select className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500">
                                <option>Comfortable</option>
                                <option>Compact</option>
                                <option>Spacious</option>
                            </select>
                        </div>
                    )}

                    {/* Save button */}
                    {section !== 'appearance' && (
                        <button
                            onClick={handleSave}
                            className={`mt-6 w-full py-2 rounded-lg text-sm font-medium transition-all ${saved ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-sky-500 text-white hover:bg-sky-600'}`}
                        >
                            {saved ? '✓ Saved' : 'Save changes'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsPanel;