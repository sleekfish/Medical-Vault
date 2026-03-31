/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',   // ← essential: enables dark: prefix via .dark class on <html>
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                'vault-primary':  '#0EA5E9',
                'vault-accent':   '#14B8A6',
                'vault-card':     '#0f0f0f',
                'vault-border':   'rgba(255,255,255,0.08)',
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
                'slide-up': 'slideUp 0.3s ease-out',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%':      { transform: 'translateY(-12px)' },
                },
                slideUp: {
                    '0%':   { opacity: '0', transform: 'translateY(8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
        },
    },
    plugins: [],
}