import crypto from "crypto";
import { getAddress, isAddress, verifyMessage } from "ethers";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;

function authenticationError(message) {
    const error = new Error(message);
    error.code = "AUTHENTICATION_FAILED";
    return error;
}

function normaliseWallet(wallet) {
    if (typeof wallet !== "string" || !isAddress(wallet)) {
        throw authenticationError("A valid wallet address is required.");
    }
    return getAddress(wallet).toLowerCase();
}

/**
 * Short-lived, in-memory sessions backed by a MetaMask personal-sign proof.
 * No wallet private key, encryption key, or long-lived credential is handled.
 */
export class WalletAuthService {
    #challenges = new Map();
    #sessions = new Map();

    createChallenge(wallet, audience = "MediVault") {
        this.#removeExpired();
        const walletAddress = normaliseWallet(wallet);
        const nonce = crypto.randomBytes(24).toString("hex");
        const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
        const message = [
            "MediVault wallet authentication",
            `Audience: ${audience}`,
            `Wallet: ${walletAddress}`,
            `Nonce: ${nonce}`,
            `Expires: ${expiresAt}`,
        ].join("\n");

        this.#challenges.set(walletAddress, { message, expiresAt });
        return { walletAddress, message, expiresAt };
    }

    verifyChallenge(wallet, signature) {
        this.#removeExpired();
        const walletAddress = normaliseWallet(wallet);
        const challenge = this.#challenges.get(walletAddress);
        if (!challenge || Date.parse(challenge.expiresAt) <= Date.now()) {
            throw authenticationError("Authentication challenge expired. Request a new one.");
        }

        let signer;
        try {
            signer = verifyMessage(challenge.message, signature).toLowerCase();
        } catch {
            throw authenticationError("Wallet signature verification failed.");
        }
        if (signer !== walletAddress) {
            throw authenticationError("Wallet signature verification failed.");
        }

        this.#challenges.delete(walletAddress);
        const accessToken = crypto.randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        this.#sessions.set(accessToken, { walletAddress, expiresAt });
        return { accessToken, walletAddress, expiresAt };
    }

    getAuthenticatedWallet(authorization) {
        this.#removeExpired();
        if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return "";

        const session = this.#sessions.get(authorization.slice(7));
        if (!session || Date.parse(session.expiresAt) <= Date.now()) return "";
        return session.walletAddress;
    }

    #removeExpired() {
        const now = Date.now();
        for (const [wallet, challenge] of this.#challenges) {
            if (Date.parse(challenge.expiresAt) <= now) this.#challenges.delete(wallet);
        }
        for (const [token, session] of this.#sessions) {
            if (Date.parse(session.expiresAt) <= now) this.#sessions.delete(token);
        }
    }
}
