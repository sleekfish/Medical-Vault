/**
 * ipfsService.ts
 * Supports BOTH Pinata API Key/Secret AND JWT authentication
 * Place in: services/ipfsService.ts
 */

const PINATA_JWT     = (import.meta.env.VITE_PINATA_JWT     || "") as string;
const PINATA_API_KEY = (import.meta.env.VITE_PINATA_API_KEY || "") as string;
const PINATA_SECRET  = (import.meta.env.VITE_PINATA_SECRET  || "") as string;
const GATEWAY_URL    = (import.meta.env.VITE_GATEWAY_URL    || "") as string;

// Debug on load
console.log("[IPFS] JWT present:", !!PINATA_JWT);
console.log("[IPFS] API Key present:", !!PINATA_API_KEY);
console.log("[IPFS] Secret present:", !!PINATA_SECRET);
console.log("[IPFS] Gateway:", GATEWAY_URL || "using public gateways");

// Build auth headers — prefer JWT, fall back to API Key + Secret
function getAuthHeaders(): Record<string, string> {
    if (PINATA_JWT) {
        return { Authorization: `Bearer ${PINATA_JWT}` };
    }
    if (PINATA_API_KEY && PINATA_SECRET) {
        return {
            pinata_api_key:        PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET,
        };
    }
    return {};
}

export const IPFS_GATEWAYS: string[] = [
    ...(GATEWAY_URL ? [`https://${GATEWAY_URL}/ipfs/`] : []),
    "https://ipfs.io/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://dweb.link/ipfs/",
    "https://w3s.link/ipfs/",
];

export function getPublicIpfsUrl(cid: string): string {
    return `${IPFS_GATEWAYS[0]}${cid}`;
}

export function isRealCid(cid: string): boolean {
    return !/^Qm[0-9a-f]+$/.test(cid);
}

export interface UploadResult {
    cid:    string;
    url:    string;
    source: "pinata" | "backend" | "mock";
}

export async function uploadFileToIPFS(
    file: File,
    onProgress?: (stage: string) => void
): Promise<UploadResult> {

    const authHeaders = getAuthHeaders();
    const hasAuth = Object.keys(authHeaders).length > 0;

    // ── 1. Pinata ─────────────────────────────────────────────────────────────
    if (hasAuth) {
        try {
            onProgress?.("Uploading to Pinata IPFS…");
            console.log("[IPFS] Uploading:", file.name, `(${(file.size / 1024).toFixed(1)} KB)`);

            const fd = new FormData();
            fd.append("file", file);
            fd.append("pinataMetadata", JSON.stringify({ name: file.name }));
            fd.append("pinataOptions",  JSON.stringify({ cidVersion: 1 }));

            const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
                method:  "POST",
                headers: authHeaders,
                body:    fd,
            });

            if (res.ok) {
                const data = await res.json();
                const cid  = data.IpfsHash as string;
                console.log("[IPFS] ✓ Pinata upload success — CID:", cid);
                return { cid, url: getPublicIpfsUrl(cid), source: "pinata" };
            }

            const errText = await res.text();
            console.error("[IPFS] Pinata error:", res.status, errText);
        } catch (e) {
            console.error("[IPFS] Pinata exception:", e);
        }
    } else {
        console.warn("[IPFS] No Pinata credentials found in .env");
    }

    // ── 2. Local backend ──────────────────────────────────────────────────────
    try {
        onProgress?.("Trying local backend…");
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("http://localhost:5000/upload", { method: "POST", body: fd });
        if (res.ok) {
            const data = await res.json();
            const cid  = data.cid as string;
            console.log("[IPFS] ✓ Backend upload success — CID:", cid);
            return { cid, url: getPublicIpfsUrl(cid), source: "backend" };
        }
        console.warn("[IPFS] Backend error:", res.status);
    } catch (e) {
        console.warn("[IPFS] Backend unavailable:", e);
    }

    // ── 3. Mock fallback ──────────────────────────────────────────────────────
    console.warn("[IPFS] All upload methods failed");
    onProgress?.("Upload failed — file hashed locally only");
    const bytes = crypto.getRandomValues(new Uint8Array(22));
    const hex   = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    return { cid: "Qm" + hex.slice(0, 44), url: "", source: "mock" };
}

export async function hashFileSHA256(file: File): Promise<string> {
    const buf     = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

export async function fetchFromIPFS(cid: string): Promise<Blob | null> {
    for (const gw of IPFS_GATEWAYS) {
        try {
            const isDedicated = GATEWAY_URL && gw.includes(GATEWAY_URL);
            const url = isDedicated && (PINATA_JWT || PINATA_API_KEY)
                ? `${gw}${cid}?pinataGatewayToken=${PINATA_JWT || PINATA_API_KEY}`
                : `${gw}${cid}`;

            console.log("[IPFS] Fetching:", url.slice(0, 70));
            const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
            if (res.ok) {
                console.log("[IPFS] ✓ Blob from:", gw);
                return res.blob();
            }
            console.warn("[IPFS]", res.status, "from", gw);
        } catch (e) {
            console.warn("[IPFS] Failed:", gw, e);
        }
    }
    console.error("[IPFS] All gateways failed for CID:", cid);
    return null;
}