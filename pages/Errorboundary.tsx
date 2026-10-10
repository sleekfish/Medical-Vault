import React from 'react';

interface State { hasError: boolean; error: Error | null; componentStack: string; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null, componentStack: '' };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        this.setState({ componentStack: info.componentStack ?? '' });
        console.error('[ErrorBoundary caught]', error, info);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        const { error, componentStack } = this.state;

        return (
            <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: 'monospace' }}>
                <div style={{ maxWidth: 720, width: '100%' }}>
                    <div style={{ background: '#1a0000', border: '1px solid #7f1d1d', borderRadius: 12, padding: 24, marginBottom: 16 }}>
                        <p style={{ color: '#f87171', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>React rendering error</p>
                        <p style={{ color: '#fca5a5', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{error?.message}</p>
                        <details style={{ cursor: 'pointer' }}>
                            <summary style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>Component stack (click to expand)</summary>
                            <pre style={{ color: '#fca5a5', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0f0000', padding: 12, borderRadius: 8, maxHeight: 320, overflow: 'auto' }}>
                                {componentStack}
                            </pre>
                        </details>
                    </div>

                    <div style={{ background: '#0f1a0f', border: '1px solid #14532d', borderRadius: 12, padding: 16 }}>
                        <p style={{ color: '#86efac', fontSize: 11, marginBottom: 8 }}>→ Copy this error and share it to get a fix.</p>
                        <button
                            onClick={() => { navigator.clipboard?.writeText(`${error?.message}\n\n${componentStack}`); }}
                            style={{ background: '#166534', color: '#86efac', border: '1px solid #16a34a', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}
                        >
                            Copy full error
                        </button>
                        <button
                            onClick={() => this.setState({ hasError: false, error: null, componentStack: '' })}
                            style={{ background: 'transparent', color: '#6b7280', border: '1px solid #374151', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', marginLeft: 8 }}
                        >
                            Try again
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;