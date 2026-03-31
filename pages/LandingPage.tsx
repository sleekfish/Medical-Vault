import React from 'react';
import { Activity, Database, Fingerprint, ShieldCheck, Lock, Stethoscope, ChevronRight, Sparkles, QrCode, Video, TrendingUp } from '../components/ui/Icons';
import { UserRole } from '../types';

interface LandingPageProps {
    onLogin: (role: UserRole) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
    return (
        <div className="relative min-h-screen bg-transparent overflow-hidden pt-16">
            <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-24">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

                    {/* Left Column */}
                    <div className="space-y-8">
                        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full text-xs text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> PDPB 2023 Compliant · ABDM Ready
                        </div>
                        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight">
                            Decentralized <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-500 dark:from-white dark:to-gray-500">Medical Vault</span>
                        </h1>

                        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-xl leading-relaxed">
                            Cybersecurity-first healthcare platform with AI triage, encrypted records, blockchain notarization, prescription QR codes, and telemedicine — for patients and doctors.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-6 pt-8">
                            <button
                                onClick={() => onLogin(UserRole.PATIENT)}
                                className="group relative px-6 py-4 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border border-blue-500/20 dark:border-blue-500/30 rounded-xl overflow-hidden transition-all duration-300 hover:border-blue-500 hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:-translate-y-1 w-full sm:w-auto text-left shadow-lg dark:shadow-none"
                            >
                                <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-600/10 transition-colors"></div>
                                <div className="relative flex items-center gap-4">
                                    <div className="p-3 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors border border-blue-500/20 group-hover:border-blue-500">
                                        <Activity className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase text-blue-600 dark:text-blue-400 font-mono tracking-widest mb-0.5">Access Portal</div>
                                        <div className="text-lg font-bold text-gray-900 dark:text-white">I'm a Patient</div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-white group-hover:translate-x-1 transition-all ml-2" />
                                </div>
                            </button>

                            <button
                                onClick={() => onLogin(UserRole.DOCTOR)}
                                className="group relative px-6 py-4 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border border-teal-500/20 dark:border-teal-500/30 rounded-xl overflow-hidden transition-all duration-300 hover:border-teal-500 hover:shadow-[0_0_30px_rgba(20,184,166,0.3)] hover:-translate-y-1 w-full sm:w-auto text-left shadow-lg dark:shadow-none"
                            >
                                <div className="absolute inset-0 bg-teal-600/5 group-hover:bg-teal-600/10 transition-colors"></div>
                                <div className="relative flex items-center gap-4">
                                    <div className="p-3 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 group-hover:bg-teal-500 group-hover:text-white transition-colors border border-teal-500/20 group-hover:border-teal-500">
                                        <Stethoscope className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase text-teal-600 dark:text-teal-400 font-mono tracking-widest mb-0.5">Provider Access</div>
                                        <div className="text-lg font-bold text-gray-900 dark:text-white">I'm a Doctor</div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-teal-600 dark:group-hover:text-white group-hover:translate-x-1 transition-all ml-2" />
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Right Column: HUD */}
                    <div className="relative h-[500px] w-full flex items-center justify-center">
                        <div className="absolute w-[450px] h-[450px] border border-gray-200 dark:border-gray-800/50 rounded-full animate-[spin_60s_linear_infinite]"></div>
                        <div className="absolute w-[350px] h-[350px] border border-gray-200 dark:border-gray-800/50 rounded-full border-dashed animate-[spin_40s_linear_infinite_reverse]"></div>

                        <div className="relative w-80 h-80 animate-float z-10">
                            <div className="absolute inset-0 bg-vault-primary/10 blur-[60px] rounded-full"></div>
                            <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-[0_0_15px_rgba(14,165,233,0.4)]">
                                <defs>
                                    <linearGradient id="bio-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#0EA5E9" />
                                        <stop offset="50%" stopColor="#3B82F6" />
                                        <stop offset="100%" stopColor="#1E40AF" />
                                    </linearGradient>
                                    <filter id="bio-glow">
                                        <feGaussianBlur stdDeviation="2" result="blur" />
                                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                    </filter>
                                    <clipPath id="heart-mask">
                                        <path d="M100 190 C 80 180 50 160 40 120 C 35 100 40 80 50 70 L 50 40 L 70 40 L 70 60 C 80 55 90 55 100 60 L 105 35 C 120 15 150 20 160 40 L 160 60 C 175 75 175 110 160 140 C 145 170 120 185 100 190 Z" />
                                    </clipPath>
                                </defs>
                                <g clipPath="url(#heart-mask)" opacity="0.3">
                                    <path d="M0 20 H200 M0 40 H200 M0 60 H200 M0 80 H200 M0 100 H200 M0 120 H200 M0 140 H200 M0 160 H200 M0 180 H200" stroke="#0EA5E9" strokeWidth="0.5" />
                                    <path d="M20 0 V200 M40 0 V200 M60 0 V200 M80 0 V200 M100 0 V200 M120 0 V200 M140 0 V200 M160 0 V200 M180 0 V200" stroke="#0EA5E9" strokeWidth="0.5" />
                                </g>
                                <g filter="url(#bio-glow)" stroke="url(#bio-gradient)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M100 190 C 80 180 50 160 40 120 C 35 100 40 80 50 70 L 50 40 L 70 40 L 70 60 C 80 55 90 55 100 60 L 105 35 C 120 15 150 20 160 40 L 160 60 C 175 75 175 110 160 140 C 145 170 120 185 100 190 Z" fill="rgba(14,165,233,0.05)" />
                                    <path d="M100 60 C 100 40 130 30 145 50" />
                                    <path d="M70 60 C 70 50 85 45 100 60" />
                                    <path d="M50 70 C 60 80 70 100 65 130" strokeOpacity="0.6" strokeDasharray="2 2" />
                                    <path d="M90 180 C 100 140 110 100 100 60" strokeOpacity="0.6" />
                                </g>
                                <circle r="3" fill="#fff" filter="url(#bio-glow)">
                                    <animateMotion dur="3s" repeatCount="indefinite" path="M90 180 C 100 140 110 100 100 60 C 100 40 130 30 145 50" />
                                </circle>
                            </svg>
                        </div>

                        <div className="absolute right-0 top-10 flex flex-col gap-6 w-64 z-20">
                            <div className="relative bg-white/80 dark:bg-vault-card/80 backdrop-blur border border-gray-200 dark:border-gray-800 p-4 rounded-xl shadow-2xl flex items-center gap-4 group">
                                <div className="absolute -left-12 top-1/2 w-12 h-[1px] bg-gray-300 dark:bg-gray-700"></div>
                                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                    <Activity className="text-vault-accent h-6 w-6" />
                                </div>
                                <div>
                                    <div className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-mono">Heart Rate</div>
                                    <div className="text-2xl font-bold text-gray-900 dark:text-white">72 <span className="text-xs text-gray-500 font-normal">BPM</span></div>
                                </div>
                            </div>

                            <div className="relative bg-white/80 dark:bg-vault-card/80 backdrop-blur border border-gray-200 dark:border-gray-800 p-4 rounded-xl shadow-2xl flex items-center gap-4">
                                <div className="absolute -left-20 top-1/2 w-20 h-[1px] bg-gray-300 dark:bg-gray-700"></div>
                                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                    <ShieldCheck className="text-gray-900 dark:text-white h-6 w-6" />
                                </div>
                                <div>
                                    <div className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-mono">Vault Status</div>
                                    <div className="text-2xl font-bold text-gray-900 dark:text-white">98% <span className="text-xs text-green-500 font-normal">Secure</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Feature section */}
                <div id="about" className="mt-32 mb-16">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">Everything healthcare needs</h2>
                        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">Military-grade encryption, blockchain notarization, AI triage, telemedicine — all in one PDPB-compliant platform.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                        {[
                            { icon: <ShieldCheck />, title: 'Triple-Lock Security', desc: 'ChaCha20-Poly1305 + AES-GCM + post-quantum Kyber key exchange.' },
                            { icon: <Lock />, title: 'Blockchain Notarized', desc: 'Every record hashed with Keccak-256 and stored immutably on Polygon.' },
                            { icon: <Sparkles />, title: 'AI Symptom Triage', desc: 'Claude AI analyses symptoms, cross-references vault records, and gives triage guidance.' },
                            { icon: <QrCode />, title: 'Prescription QR', desc: 'Tamper-proof on-chain QR codes for pharmacist verification.' },
                            { icon: <Video />, title: 'Telemedicine', desc: 'Encrypted WebRTC video consultations with in-call record sharing.' },
                            { icon: <TrendingUp />, title: 'Health Trends', desc: '90-day biometric history with interactive analytics charts.' },
                            { icon: <Database />, title: 'PDPB Compliant', desc: 'Built for Indian healthcare with ABDM integration capabilities.' },
                            { icon: <Fingerprint />, title: 'Zero-Trust Model', desc: 'Full consent audit trail and emergency break-glass access protocols.' },
                        ].map(f => (
                            <div key={f.title} className="bg-white dark:bg-[#0f0f0f] border border-gray-200 dark:border-[#1f1f1f] p-6 rounded-2xl hover:border-gray-400 dark:hover:border-gray-600 transition-all group">
                                <div className="w-10 h-10 bg-gray-100 dark:bg-[#1a1a1a] rounded-xl flex items-center justify-center mb-4 text-gray-900 dark:text-white">
                                    {f.icon}
                                </div>
                                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <footer className="border-t border-gray-200 dark:border-gray-900 pt-12 pb-12 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
                    <div className="flex items-center gap-2 mb-4 md:mb-0">
                        <ShieldCheck className="h-5 w-5 text-gray-400" />
                        <span className="font-semibold text-gray-900 dark:text-white">Medical Vault</span>
                    </div>
                    <div className="flex gap-6 flex-wrap justify-center">
                        <span className="hover:text-vault-primary dark:hover:text-white cursor-pointer">Terms of Service</span>
                        <span className="hover:text-vault-primary dark:hover:text-white cursor-pointer">Privacy Policy</span>
                        <span className="hover:text-vault-primary dark:hover:text-white cursor-pointer">Patient Consent</span>
                        <span className="hover:text-vault-primary dark:hover:text-white cursor-pointer">Data Handling Policy</span>
                    </div>
                    <div className="mt-4 md:mt-0 text-right">
                        <p>© 2026 Decentralized Medical Vault.</p>
                        <p>PDPB 2023 Compliant · ABDM Ready.</p>
                    </div>
                </footer>
            </main>
        </div>
    );
};

export default LandingPage;