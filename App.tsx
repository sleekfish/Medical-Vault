import React, { useState, useEffect, useCallback } from 'react';
import { User, UserRole } from './types';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';

declare global { interface Window { ethereum?: any; } }

const LandingPage      = React.lazy(() => import('./pages/LandingPage'));
const AuthPage         = React.lazy(() => import('./pages/AuthPage'));
const PatientDashboard = React.lazy(() => import('./pages/PatientDashboard'));
const DoctorDashboard  = React.lazy(() => import('./pages/DoctorDashboard'));
const Navbar           = React.lazy(() => import('./components/Navbar'));
const BackgroundGrid   = React.lazy(() => import('./components/BackgroundGrid'));

const PageLoader = () => (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc' }}>
        <div style={{ textAlign:'center' }}>
            <div style={{ width:32, height:32, border:'2px solid #0ea5e9', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'0 auto 12px' }}/>
            <p style={{ color:'#6b7280', fontSize:13, fontFamily:'sans-serif' }}>Loading…</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
);

interface EBState { error: Error | null; }
interface EBProps { children: React.ReactNode; name: string; }

class PageErrorBoundary extends React.Component<EBProps, EBState> {
    state: EBState = { error: null };
    private props: any;

    static getDerivedStateFromError(error: Error): EBState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[${this.props.name} crashed]`, error.message, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        const msg   = (error as Error).message ?? 'Unknown error';
        const stack = (error as Error).stack   ?? '';
        return (
            <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', fontFamily:'monospace', padding:32 }}>
                <div style={{ maxWidth:640, width:'100%' }}>
                    <p style={{ color:'#be123c', fontSize:11, textTransform:'uppercase', letterSpacing:2, marginBottom:8 }}>
                        💥 {this.props.name} crashed
                    </p>
                    <p style={{ color:'#e11d48', fontSize:16, fontWeight:600, marginBottom:16 }}>
                        {msg}
                    </p>
                    <pre style={{ background:'#fce7f3', padding:16, borderRadius:8, fontSize:11, whiteSpace:'pre-wrap', wordBreak:'break-all', color:'#9d174d', maxHeight:300, overflow:'auto' }}>
                        {stack}
                    </pre>
                    <div style={{ display:'flex', gap:8, marginTop:16 }}>
                        <button onClick={() => this.setState({ error: null })}
                                style={{ background:'#e11d48', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', fontSize:13, cursor:'pointer' }}>
                            Try again
                        </button>
                        <button onClick={() => window.location.reload()}
                                style={{ background:'#6b7280', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', fontSize:13, cursor:'pointer' }}>
                            Reload page
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    private setState(param: { error: null }) {
        
    }
}

type Page = 'LANDING' | 'AUTH' | 'DASHBOARD';

function AppContent() {
    const [page, setPage]   = useState<Page>('LANDING');
    const [role, setRole]   = useState<UserRole | null>(null);
    const [user, setUser]   = useState<User | null>(null);
    const [ready, setReady] = useState(false);

    console.log('[App] render — page:', page, 'user:', user?.id?.slice(0,10) ?? 'none', 'role:', user?.role ?? 'none');

    const login = useCallback((address: string) => {
        const savedRole = (localStorage.getItem('vault_role') as UserRole) || UserRole.PATIENT;
        const savedName = localStorage.getItem('vault_temp_name');
        console.log('[App] login() — address:', address, 'role:', savedRole);
        // Save wallet address so dashboards can access it
        localStorage.setItem("vault_wallet", address.toLowerCase());

        setUser({
            id: address,
            email: '',
            name: savedName || `${address.slice(0,6)}…${address.slice(-4)}`,
            role: savedRole,
            isVerified: true,
        });
        setPage('DASHBOARD');
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('vault_role');
        localStorage.removeItem('vault_temp_name');
        setUser(null); setRole(null); setPage('LANDING');
    }, []);

    const selectRole = useCallback((r: UserRole) => {
        setRole(r);
        localStorage.setItem('vault_role', r);
        setPage('AUTH');
    }, []);

    useEffect(() => {
        const init = async () => {
            if (window.ethereum) {
                try {
                    // Use eth_accounts (no popup) to check existing connection
                    const accounts: string[] = await window.ethereum.request({ method: 'eth_accounts' });
                    console.log('[App] existing accounts:', accounts);
                    if (accounts.length > 0 && localStorage.getItem('vault_role')) {
                        login(accounts[0]);
                    }
                } catch (e) {
                    console.error('[App] init error:', e);
                }
                window.ethereum.on('accountsChanged', (accs: string[]) => {
                    console.log('[App] accountsChanged:', accs);
                    accs.length > 0 ? login(accs[0]) : logout();
                });
                window.ethereum.on('chainChanged', () => window.location.reload());
            } else {
                console.warn('[App] window.ethereum not found');
            }
            setReady(true);
        };
        init();
        return () => {
            window.ethereum?.removeAllListeners?.('accountsChanged');
            window.ethereum?.removeAllListeners?.('chainChanged');
        };
    }, [login, logout]);

    if (!ready) return <PageLoader />;

    return (
        <div className="min-h-screen relative">
            <React.Suspense fallback={null}>
                <PageErrorBoundary name="BackgroundGrid">
                    <BackgroundGrid />
                </PageErrorBoundary>
            </React.Suspense>

            <React.Suspense fallback={null}>
                <PageErrorBoundary name="Navbar">
                    <Navbar user={user} onLogout={logout} />
                </PageErrorBoundary>
            </React.Suspense>

            <main className="relative z-10">
                <React.Suspense fallback={<PageLoader />}>
                    {page === 'DASHBOARD' && user ? (
                        <PageErrorBoundary name={user.role === UserRole.PATIENT ? 'PatientDashboard' : 'DoctorDashboard'}>
                            {user.role === UserRole.PATIENT
                                ? <PatientDashboard />
                                : <DoctorDashboard />
                            }
                        </PageErrorBoundary>
                    ) : page === 'AUTH' && role ? (
                        <PageErrorBoundary name="AuthPage">
                            <AuthPage role={role} onBack={() => setPage('LANDING')} onConnect={login} />
                        </PageErrorBoundary>
                    ) : (
                        <PageErrorBoundary name="LandingPage">
                            <LandingPage onLogin={selectRole} />
                        </PageErrorBoundary>
                    )}
                </React.Suspense>
            </main>
        </div>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <ToastProvider>
                <AppContent />
            </ToastProvider>
        </ThemeProvider>
    );
}