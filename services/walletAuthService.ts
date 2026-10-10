const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:5000") as string;
const SESSION_KEY_PREFIX = "medivault_wallet_session_";

interface WalletSession {
    accessToken: string;
    walletAddress: string;
    expiresAt: string;
}

function normaliseWallet(wallet: string): string {
    return wallet.trim().toLowerCase();
}

function readSession(wallet: string): WalletSession | null {
    try {
        const raw = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${normaliseWallet(wallet)}`);
        if (!raw) return null;
        const session = JSON.parse(raw) as WalletSession;
        if (Date.parse(session.expiresAt) <= Date.now()) return null;
        return session;
    } catch {
        return null;
    }
}

export function clearWalletAccessToken(wallet: string): void {
    sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${normaliseWallet(wallet)}`);
}

/** Obtains a short-lived backend session after a MetaMask personal-sign proof. */
export async function getWalletAccessToken(wallet: string, forceRefresh = false): Promise<string> {
    const cached = forceRefresh ? null : readSession(wallet);
    if (cached) return cached.accessToken;
    if (!window.ethereum) throw new Error("Connect MetaMask to access encrypted records.");

    const selectedAccounts = await window.ethereum.request({ method: "eth_accounts" }) as string[];
    const selectedWallet = selectedAccounts[0]?.toLowerCase();
    if (!selectedWallet) {
        throw new Error("Connect MetaMask to authenticate your wallet.");
    }
    if (selectedWallet !== normaliseWallet(wallet)) {
        throw new Error("Switch MetaMask to the wallet connected to this vault, then try again.");
    }

    const challengeResponse = await fetch(`${BACKEND_URL}/api/auth/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
    });
    const challenge = await challengeResponse.json().catch(() => ({}));
    if (!challengeResponse.ok) throw new Error(challenge.error || "Could not start wallet authentication.");

    let signature: string;
    try {
        signature = await window.ethereum.request({
            method: "personal_sign",
            params: [challenge.message, wallet],
        });
    } catch {
        throw new Error("Wallet signature is required to access encrypted records.");
    }

    const verifyResponse = await fetch(`${BACKEND_URL}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, signature }),
    });
    const session = await verifyResponse.json().catch(() => ({}));
    if (!verifyResponse.ok) throw new Error(session.error || "Wallet authentication failed.");

    sessionStorage.setItem(`${SESSION_KEY_PREFIX}${normaliseWallet(wallet)}`, JSON.stringify(session));
    return session.accessToken as string;
}
