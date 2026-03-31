import React, { createContext, useContext, useState, useCallback } from 'react';

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
}

interface ToastContextType {
    addToast: (type: Toast['type'], message: string) => void;
}

const ToastContext = createContext<ToastContextType>({ addToast: () => {} });

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((type: Toast['type'], message: string) => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);

    const colorMap = {
        success: 'bg-green-900/80 border-green-500/30 text-green-300',
        error: 'bg-red-900/80 border-red-500/30 text-red-300',
        info: 'bg-blue-900/80 border-blue-500/30 text-blue-300',
        warning: 'bg-yellow-900/80 border-yellow-500/30 text-yellow-300',
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
                {toasts.map(t => (
                    <div key={t.id} className={`px-4 py-3 rounded-lg border backdrop-blur text-sm font-medium shadow-lg ${colorMap[t.type]} animate-slide-up`}>
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => useContext(ToastContext);