import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Catch any synchronous import-time errors and show them
try {
    const root = document.getElementById('root')
    if (!root) {
        document.body.innerHTML = '<div style="color:red;font-family:monospace;padding:2rem">ERROR: No #root element found in index.html</div>'
    } else {
        ReactDOM.createRoot(root).render(
            <React.StrictMode>
                <App />
            </React.StrictMode>
        )
    }
} catch (e: any) {
    document.body.style.background = '#050505'
    document.body.style.color = '#f87171'
    document.body.style.fontFamily = 'monospace'
    document.body.style.padding = '2rem'
    document.body.innerHTML = `
        <h2 style="color:#f87171;margin-bottom:1rem">Startup crash</h2>
        <p style="color:#fca5a5;margin-bottom:1rem">${e?.message ?? String(e)}</p>
        <pre style="background:#1a0000;padding:1rem;border-radius:8px;white-space:pre-wrap;word-break:break-all;font-size:12px;color:#fca5a5">${e?.stack ?? ''}</pre>
    `
}