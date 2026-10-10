import React, { useState, useEffect, useCallback } from 'react';
import { User, UserRole } from './types';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider }  from './context/ToastContext';
import Navbar             from './components/Navbar';
import BackgroundGrid     from './components/BackgroundGrid';

declare global { interface Window { ethereum?: any; } }

const LandingPage      = React.lazy(() => import('./pages/LandingPage'));
const AuthPage         = React.lazy(() => import('./pages/AuthPage'));
const PatientDashboard = React.lazy(() => import('./pages/PatientDashboard'));
const DoctorDashboard  = React.lazy(() => import('./pages/DoctorDashboard'));

interface EBProps { children: React.ReactNode; name: string; }
interface EBState { error: Error | null; }

class ErrorBoundary extends React.Component<EBProps, EBState> {
    state: EBState = { error: null };
    static getDerivedStateFromError(error: Error): EBState { return { error }; }
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[${this.props.name} crashed]`, error.message, info.componentStack);
    }
    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff1f2', fontFamily:'monospace', padding:32 }}>
                <div style={{ maxWidth:640, width:'100%' }}>
                    <p style={{ color:'#be123c', fontSize:11, textTransform:'uppercase', letterSpacing:2, marginBottom:8 }}>💥 {this.props.name} crashed</p>
                    <p style={{ color:'#e11d48', fontSize:16, fontWeight:600, marginBottom:16 }}>{(error as Error).message}</p>
                    <pre style={{ background:'#fce7f3', padding:16, borderRadius:8, fontSize:11, whiteSpace:'pre-wrap', color:'#9d174d', maxHeight:300, overflow:'auto' }}>{(error as Error).stack}</pre>
                    <div style={{ display:'flex', gap:8, marginTop:16 }}>
                        <button onClick={() => this.setState({ error:null })} style={{ background:'#e11d48', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', fontSize:13, cursor:'pointer' }}>Try again</button>
                        <button onClick={() => window.location.reload()} style={{ background:'#6b7280', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', fontSize:13, cursor:'pointer' }}>Reload</button>
                    </div>
                </div>
            </div>
        );
    }
}

const Loader = () => (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc' }}>
        <div style={{ textAlign:'center' }}>
            <div style={{ width:32, height:32, border:'2px solid #0ea5e9', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'0 auto 12px' }} />
            <p style={{ color:'#6b7280', fontSize:13, fontFamily:'sans-serif' }}>Loading…</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
);

type Page = 'LANDING' | 'AUTH' | 'DASHBOARD';

function AppContent() {
    const [page,  setPage]  = useState<Page>('LANDING');
    const [role,  setRole]  = useState<UserRole | null>(null);
    const [user,  setUser]  = useState<User | null>(null);
    const [ready, setReady] = useState(false);

    const login = useCallback((address: string) => {
        const savedRole = (localStorage.getItem('vault_role') as UserRole) || UserRole.PATIENT;
        const savedName = localStorage.getItem('vault_temp_name');
        localStorage.setItem('vault_wallet', address.toLowerCase());
        setUser({ id: address, email: '', name: savedName || `${address.slice(0,6)}…${address.slice(-4)}`, role: savedRole, isVerified: true });
        setPage('DASHBOARD');
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('vault_role');
        localStorage.removeItem('vault_temp_name');
        setUser(null); setRole(null); setPage('LANDING');
    }, []);

    const selectRole = useCallback((r: UserRole) => {
        setRole(r); localStorage.setItem('vault_role', r); setPage('AUTH');
    }, []);

    useEffect(() => {
        const init = async () => {
            if (window.ethereum) {
                try {
                    const accounts: string[] = await window.ethereum.request({ method: 'eth_accounts' });
                    if (accounts.length > 0 && localStorage.getItem('vault_role')) login(accounts[0]);
                } catch (e) { console.error('[App] init error:', e); }
                window.ethereum.on('accountsChanged', (accs: string[]) => accs.length > 0 ? login(accs[0]) : logout());
                window.ethereum.on('chainChanged', () => window.location.reload());
            }
            setReady(true);
        };
        init();
        return () => {
            window.ethereum?.removeAllListeners?.('accountsChanged');
            window.ethereum?.removeAllListeners?.('chainChanged');
        };
    }, [login, logout]);

    if (!ready) return <Loader />;

    return (
        <div className="min-h-screen relative">
            <BackgroundGrid />
            <ErrorBoundary name="Navbar"><Navbar user={user} onLogout={logout} /></ErrorBoundary>
            <main className="relative z-10">
                <React.Suspense fallback={<Loader />}>
                    {page === 'DASHBOARD' && user ? (
                        <ErrorBoundary name={user.role === UserRole.PATIENT ? 'PatientDashboard' : 'DoctorDashboard'}>
                            {user.role === UserRole.PATIENT ? <PatientDashboard /> : <DoctorDashboard />}
                        </ErrorBoundary>
                    ) : page === 'AUTH' && role ? (
                        <ErrorBoundary name="AuthPage">
                            <AuthPage role={role} onBack={() => setPage('LANDING')} onConnect={login} />
                        </ErrorBoundary>
                    ) : (
                        <ErrorBoundary name="LandingPage">
                            <LandingPage onLogin={selectRole} />
                        </ErrorBoundary>
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