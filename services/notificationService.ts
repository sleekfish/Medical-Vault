export type NotificationType =
    | "WALLET_CONNECTED"
    | "FILE_ADDED"
    | "PRESCRIPTION"
    | "APPOINTMENT"
    | "ACCESS_GRANTED"
    | "ACCESS_REVOKED"
    | "CONNECTION_REQUEST"
    | "EMERGENCY"
    | "SYSTEM"
    | "DOCUMENT_ACCESSED";

export interface NotificationItem {
    id: string;
    recipientWallet: string;
    actorWallet?: string;
    type: NotificationType;
    title: string;
    message: string;
    createdAt: string;
    read: boolean;
    metadata?: Record<string, unknown>;
}

const API = (import.meta.env.VITE_BACKEND_URL || "http://localhost:5000") as string;

const normalize = (wallet: string) => (wallet || "").trim().toLowerCase();

export async function getNotifications(wallet: string): Promise<NotificationItem[]> {
    const w = normalize(wallet);
    if (!w) return [];
    const response = await fetch(`${API}/api/notifications/${encodeURIComponent(w)}`);
    if (!response.ok) throw new Error(`Notifications request failed (${response.status})`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

export async function createNotification(input: {
    recipientWallet: string;
    actorWallet?: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
}): Promise<NotificationItem | null> {
    const response = await fetch(`${API}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            ...input,
            recipientWallet: normalize(input.recipientWallet),
            actorWallet: input.actorWallet ? normalize(input.actorWallet) : undefined,
        }),
    });
    if (!response.ok) return null;
    return response.json();
}

export async function markNotificationRead(id: string): Promise<void> {
    await fetch(`${API}/api/notifications/${encodeURIComponent(id)}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
    });
}

export async function markAllNotificationsRead(wallet: string): Promise<void> {
    const w = normalize(wallet);
    if (!w) return;
    await fetch(`${API}/api/notifications/${encodeURIComponent(w)}/read-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
    });
}