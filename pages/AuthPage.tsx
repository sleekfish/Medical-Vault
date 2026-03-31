import React, { useState } from 'react';
import { ShieldCheck, Loader2, Activity, Stethoscope, ArrowLeft } from '../components/ui/Icons';
import { UserRole } from '../types';
import { useToast } from '../context/ToastContext';
import { ethers } from 'ethers';

interface AuthPageProps {
    role: UserRole;
    onBack: () => void;
    onConnect: (address: string) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ role, onBack, onConnect }) => {
    const { addToast } = useToast();
    const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [license, setLicense] = useState('');

    const isPatient = role === UserRole.PATIENT;

    const handleMetaMaskConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!window.ethereum) {
            addToast('error', 'MetaMask not detected. Please install MetaMask.');
            return;
        }
        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await provider.send("eth_requestAccounts", []);
            localStorage.setItem('vault_role', role);
            if (authMode === 'REGISTER') {
                localStorage.setItem('vault_temp_name', name);
            }
            addToast('success', 'Wallet connected successfully.');
            onConnect(accounts[0]);
        } catch {
            addToast('error', 'Connection failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col justify-center items-center py-12 px-4 bg-[#050505]">
            <button
                onClick={onBack}
                className="absolute top-24 left-8 flex items-center gap-1.5 text-gray-500 hover:text-white transition-colors text-sm"
            >
                <ArrowLeft size={15} /> Back
            </button>

            <div className="w-full max-w-md">
                {/* Role pill */}
                <div className={`flex items-center gap-2 mb-6 px-4 py-2 rounded-full border w-fit mx-auto ${isPatient ? 'bg-sky-500/10 border-sky-500/20 text-sky-400' : 'bg-teal-500/10 border-teal-500/20 text-teal-400'}`}>
                    {isPatient ? <Activity size={15} /> : <Stethoscope size={15} />}
                    <span className="text-sm font-medium">{isPatient ? 'Patient Portal' : 'Doctor Portal'}</span>
                </div>

                <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-8 shadow-2xl">
                    <div className="text-center mb-8">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${isPatient ? 'bg-sky-500/10' : 'bg-teal-500/10'}`}>
                            <ShieldCheck className={`h-6 w-6 ${isPatient ? 'text-sky-400' : 'text-teal-400'}`} />
                        </div>
                        <h2 className="text-2xl font-bold text-white">
                            {authMode === 'LOGIN' ? 'Access your vault' : 'Create account'}
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">Connect your MetaMask wallet to continue</p>
                    </div>

                    <form onSubmit={handleMetaMaskConnect} className="space-y-4">
                        {authMode === 'REGISTER' && (
                            <>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">Full name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder={isPatient ? 'Your full name' : 'Dr. First Last'}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-sky-500 placeholder-gray-600"
                                    />
                                </div>
                                {!isPatient && (
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">MCI License number</label>
                                        <input
                                            type="text"
                                            value={license}
                                            onChange={e => setLicense(e.target.value)}
                                            placeholder="MCI-YYYY-XXXX"
                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500 placeholder-gray-600 font-mono"
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full flex justify-center items-center gap-2 py-3 rounded-xl font-medium transition-all disabled:opacity-60 ${isPatient ? 'bg-sky-500 hover:bg-sky-600' : 'bg-teal-500 hover:bg-teal-600'} text-white`}
                        >
                            {loading ? <Loader2 className="animate-spin" size={16} /> : (
                                <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" className="w-5 h-5" alt="MetaMask" onError={e => (e.currentTarget.style.display = 'none')} />
                            )}
                            {loading ? 'Connecting…' : 'Connect MetaMask'}
                        </button>
                    </form>

                    <button
                        onClick={() => setAuthMode(authMode === 'LOGIN' ? 'REGISTER' : 'LOGIN')}
                        className="w-full mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                    >
                        {authMode === 'LOGIN' ? "New here? Create account" : "Already have an account? Login"}
                    </button>

                    <div className="mt-6 pt-5 border-t border-white/5 text-center">
                        <p className="text-xs text-gray-600">
                            Your wallet address becomes your identity. We never store private keys.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;