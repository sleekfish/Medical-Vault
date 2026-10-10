import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Bell, CheckCircle, AlertTriangle, Calendar, FileText, QrCode, Shield, RefreshCw,
} from "./Icons";
import {
    createNotification,
    getNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    type NotificationItem,
} from "../../services/notificationService";
import {
    getNotificationSoundEnabled,
    playNotificationSound,
    setNotificationSoundEnabled,
    unlockNotificationAudio,
} from "../../services/notificationSound";
import NotificationToast, { kindFor } from "./NotificationToast";

interface Props {
    wallet: string;
    dark?: boolean;
}

const shortWallet = (wallet?: string) =>
    wallet ? `${wallet.slice(0, 10)}…${wallet.slice(-4)}` : "wallet";

const iconFor = (type: NotificationItem["type"]) => {
    switch (type) {
        case "PRESCRIPTION": return <QrCode size={15} className="text-emerald-500" />;
        case "FILE_ADDED":
        case "DOCUMENT_ACCESSED": return <FileText size={15} className="text-sky-500" />;
        case "APPOINTMENT": return <Calendar size={15} className="text-violet-500" />;
        case "ACCESS_GRANTED":
        case "ACCESS_REVOKED": return <Shield size={15} className="text-amber-500" />;
        case "EMERGENCY": return <AlertTriangle size={15} className="text-red-500" />;
        default: return <CheckCircle size={15} className="text-sky-500" />;
    }
};

const NotificationBell: React.FC<Props> = ({ wallet, dark = false }) => {
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [open, setOpen] = useState(false);
    const [sound, setSound] = useState(getNotificationSoundEnabled());
    const [shaking, setShaking] = useState(false);
    const [toasts, setToasts] = useState<NotificationItem[]>([]);
    const knownIds = useRef<Set<string>>(new Set());
    const firstLoad = useRef(true);
    const lastWallet = useRef("");

    const load = useCallback(async (initial = false) => {
        if (!wallet) return;
        try {
            const latest = await getNotifications(wallet);
            const previous = knownIds.current;

            if (!initial) {
                const fresh = latest
                    .filter(n => !previous.has(n.id))
                    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

                if (fresh.length) {
                    setToasts(prev => [...prev, ...fresh].slice(-3));
                    setShaking(true);
                    window.setTimeout(() => setShaking(false), 850);

                    fresh.forEach(n => {
                        playNotificationSound(kindFor(n.type) as any);
                    });
                }
            }

            knownIds.current = new Set(latest.map(n => n.id));
            setItems(latest);
        } catch (error) {
            console.warn("[Notifications] poll failed:", error);
        }
    }, [wallet]);

    useEffect(() => {
        if (!wallet) return;
        if (lastWallet.current !== wallet.toLowerCase()) {
            lastWallet.current = wallet.toLowerCase();
            knownIds.current = new Set();
            firstLoad.current = true;
            setItems([]);
            setToasts([]);
        }

        let cancelled = false;

        (async () => {
            if (cancelled) return;
            await load(true);
            if (cancelled) return;

            // Create the wallet-connected event once per browser session.
            const sessionKey = `medivault_wallet_connected_${wallet.toLowerCase()}`;
            if (!sessionStorage.getItem(sessionKey)) {
                sessionStorage.setItem(sessionKey, "1");
                const created = await createNotification({
                    recipientWallet: wallet,
                    actorWallet: wallet,
                    type: "WALLET_CONNECTED",
                    title: "Wallet connected",
                    message: `${shortWallet(wallet)} connected to Medical Vault.`,
                });
                if (created) {
                    knownIds.current.add(created.id);
                    setItems(prev => [created, ...prev].slice(0, 100));
                    setToasts(prev => [...prev, created].slice(-3));
                    setShaking(true);
                    window.setTimeout(() => setShaking(false), 850);
                    playNotificationSound("normal");
                }
            }
        })();

        const interval = window.setInterval(() => void load(false), 2000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [wallet, load]);

    const unread = useMemo(() => items.filter(n => !n.read).length, [items]);

    const closeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(n => n.id !== id));
    }, []);

    const handleRead = async (id: string) => {
        setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        await markNotificationRead(id);
    };

    const handleMarkAll = async () => {
        setItems(prev => prev.map(n => ({ ...n, read: true })));
        await markAllNotificationsRead(wallet);
    };

    const toggleSound = async () => {
        const next = !sound;
        setSound(next);
        setNotificationSoundEnabled(next);
        if (next) await unlockNotificationAudio();
    };

    return (
        <>
            <div className="relative">
                <button
                    type="button"
                    onClick={async () => {
                        await unlockNotificationAudio();
                        setOpen(v => !v);
                    }}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                        dark
                            ? "border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07]"
                            : "border-gray-200 bg-white text-gray-600 hover:border-sky-300 hover:text-sky-500"
                    } ${shaking ? "animate-pulse" : ""}`}
                    aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                >
                    <Bell size={17} className={shaking ? "animate-bounce" : ""} />
                    {unread > 0 && (
                        <span className="absolute -right-1 -top-1 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-lg ring-2 ring-white">
                            {unread > 99 ? "99+" : unread}
                        </span>
                    )}
                </button>

                {open && (
                    <>
                        <div className="fixed inset-0 z-[9990]" onClick={() => setOpen(false)} />
                        <div className={`absolute right-0 top-12 z-[9995] w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl ${
                            dark ? "border-white/10 bg-[#0f0f0f]/95 text-white" : "border-gray-200 bg-white/95 text-gray-900"
                        }`}>
                            <div className={`flex items-center justify-between border-b px-4 py-3 ${dark ? "border-white/10" : "border-gray-100"}`}>
                                <div>
                                    <p className="text-sm font-bold">Notifications</p>
                                    <p className={`text-[10px] ${dark ? "text-gray-500" : "text-gray-400"}`}>
                                        {unread ? `${unread} unread` : "All caught up"}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void toggleSound()}
                                        className={`rounded-lg border px-2 py-1 text-[10px] ${dark ? "border-white/10 text-gray-400" : "border-gray-200 text-gray-500"}`}
                                    >
                                        {sound ? "🔊 Sound" : "🔇 Muted"}
                                    </button>
                                    {unread > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => void handleMarkAll()}
                                            className="text-[10px] font-semibold text-sky-500 hover:text-sky-600"
                                        >
                                            Mark all read
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="max-h-[430px] overflow-y-auto">
                                {items.length === 0 ? (
                                    <div className={`py-14 text-center ${dark ? "text-gray-500" : "text-gray-400"}`}>
                                        <Bell size={24} className="mx-auto mb-2 opacity-30" />
                                        <p className="text-xs">No notifications yet.</p>
                                    </div>
                                ) : (
                                    items.map(item => (
                                        <button
                                            type="button"
                                            key={item.id}
                                            onClick={() => void handleRead(item.id)}
                                            className={`flex w-full gap-3 border-b px-4 py-3 text-left transition-colors ${
                                                dark
                                                    ? `border-white/5 hover:bg-white/[0.04] ${item.read ? "" : "bg-sky-500/[0.04]"}`
                                                    : `border-gray-100 hover:bg-gray-50 ${item.read ? "" : "bg-sky-50/60"}`
                                            }`}
                                        >
                                            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50">
                                                {iconFor(item.type)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className={`text-xs font-semibold ${dark ? "text-white" : "text-gray-900"}`}>
                                                        {item.title}
                                                    </p>
                                                    {!item.read && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-500" />}
                                                </div>
                                                <p className={`mt-0.5 text-[11px] leading-4 ${dark ? "text-gray-400" : "text-gray-500"}`}>
                                                    {item.message}
                                                </p>
                                                <p className={`mt-1 text-[9px] ${dark ? "text-gray-600" : "text-gray-400"}`}>
                                                    {new Date(item.createdAt).toLocaleString("en-IN", {
                                                        day: "2-digit",
                                                        month: "short",
                                                        year: "numeric",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </p>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>

                            <div className={`border-t px-4 py-2 ${dark ? "border-white/10" : "border-gray-100"}`}>
                                <p className={`text-[9px] ${dark ? "text-gray-600" : "text-gray-400"}`}>
                                    Wallet: <span className="font-mono">{shortWallet(wallet)}</span> · Live updates every 2s
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="fixed right-5 top-[90px] z-[99999] flex w-[min(420px,calc(100vw-2rem))] max-h-[calc(100vh-110px)] flex-col gap-3 overflow-hidden pointer-events-none">
                {toasts.map(item => (
                    <div key={item.id} className="pointer-events-auto">
                        <NotificationToast notification={item} onClose={closeToast} />
                    </div>
                ))}
            </div>
        </>
    );
};

export default NotificationBell;