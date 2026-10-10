import React, { useEffect, useState } from "react";
import {
    Bell,
    CheckCircle,
    AlertTriangle,
    Calendar,
    FileText,
    QrCode,
    Shield,
} from "./Icons";
import type { NotificationItem } from "../../services/notificationService";

interface Props {
    notification: NotificationItem;
    onClose: (id: string) => void;
}

const iconFor = (type: NotificationItem["type"]) => {
    switch (type) {
        case "PRESCRIPTION":
            return <QrCode size={18} />;
        case "FILE_ADDED":
        case "DOCUMENT_ACCESSED":
            return <FileText size={18} />;
        case "APPOINTMENT":
            return <Calendar size={18} />;
        case "ACCESS_GRANTED":
        case "ACCESS_REVOKED":
            return <Shield size={18} />;
        case "EMERGENCY":
            return <AlertTriangle size={18} />;
        case "WALLET_CONNECTED":
        case "CONNECTION_REQUEST":
            return <CheckCircle size={18} />;
        default:
            return <Bell size={18} />;
    }
};

const accentFor = (type: NotificationItem["type"]) => {
    switch (type) {
        case "PRESCRIPTION":
            return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
        case "FILE_ADDED":
        case "DOCUMENT_ACCESSED":
            return "text-sky-500 bg-sky-500/10 border-sky-500/20";
        case "APPOINTMENT":
            return "text-violet-500 bg-violet-500/10 border-violet-500/20";
        case "EMERGENCY":
            return "text-red-500 bg-red-500/10 border-red-500/20";
        case "ACCESS_REVOKED":
            return "text-amber-500 bg-amber-500/10 border-amber-500/20";
        default:
            return "text-sky-500 bg-sky-500/10 border-sky-500/20";
    }
};

const kindFor = (type: NotificationItem["type"]) =>
    type === "PRESCRIPTION"
        ? "prescription"
        : type === "APPOINTMENT"
            ? "appointment"
            : type === "EMERGENCY"
                ? "emergency"
                : "normal";

export const NotificationToast: React.FC<Props> = ({
                                                       notification,
                                                       onClose,
                                                   }) => {
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        const closeTimer = window.setTimeout(() => setClosing(true), 4300);
        const removeTimer = window.setTimeout(
            () => onClose(notification.id),
            4680,
        );

        return () => {
            window.clearTimeout(closeTimer);
            window.clearTimeout(removeTimer);
        };
    }, [notification.id, onClose]);

    const closeNotification = () => {
        if (closing) return;
        setClosing(true);

        // Let the exit animation finish, then remove the toast.
        window.setTimeout(() => onClose(notification.id), 380);
    };

    return (
        <>
            <style>{`
                @keyframes mvAlertIn {
                    from {
                        opacity: 0;
                        transform: translate3d(34px, 0, 0) scale(.96);
                    }
                    to {
                        opacity: 1;
                        transform: translate3d(0, 0, 0) scale(1);
                    }
                }

                @keyframes mvAlertOut {
                    from {
                        opacity: 1;
                        transform: translate3d(0, 0, 0) scale(1);
                    }
                    to {
                        opacity: 0;
                        transform: translate3d(34px, 0, 0) scale(.96);
                    }
                }

                @keyframes mvAlertProgress {
                    from { transform: scaleX(1); }
                    to { transform: scaleX(0); }
                }

                @media (prefers-reduced-motion: reduce) {
                    .mv-alert-motion { animation: none !important; }
                    .mv-alert-progress { animation: none !important; }
                }
            `}</style>

            <div
                className="mv-alert-motion w-full overflow-hidden rounded-2xl border border-gray-200/80 bg-white/95 text-gray-900 shadow-2xl backdrop-blur-xl"
                style={{
                    animation: `${closing ? "mvAlertOut" : "mvAlertIn"} .38s cubic-bezier(.2,.8,.2,1) both`,
                    willChange: "transform, opacity",
                }}
                role="status"
                aria-live="polite"
            >
                <div className="p-4 flex gap-3">
                    <div
                        className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${accentFor(notification.type)}`}
                    >
                        {iconFor(notification.type)}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold leading-5">
                                {notification.title}
                            </p>

                            <button
                                type="button"
                                onClick={closeNotification}
                                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-900 text-lg leading-none transition-colors"
                                aria-label="Close notification"
                            >
                                ×
                            </button>
                        </div>

                        <p className="mt-1 text-xs leading-5 text-gray-500">
                            {notification.message}
                        </p>

                        <p className="mt-2 text-[10px] font-medium text-gray-400">
                            {new Date(notification.createdAt).toLocaleString(
                                "en-IN",
                                {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                },
                            )}
                        </p>
                    </div>
                </div>

                <div className="h-0.5 bg-gray-100">
                    <div
                        className="mv-alert-progress h-full origin-left bg-sky-500"
                        style={{ animation: "mvAlertProgress 4.3s linear both" }}
                    />
                </div>
            </div>
        </>
    );
};

export { kindFor };
export default NotificationToast;