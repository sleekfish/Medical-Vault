import {
    clearWalletAccessToken,
    getWalletAccessToken,
} from "./walletAuthService";

const BACKEND_URL =
    (import.meta.env.VITE_BACKEND_URL ||
        "http://localhost:5000") as string;

const GATEWAY_URL =
    (import.meta.env.VITE_GATEWAY_URL || "") as string;

export const IPFS_GATEWAYS: string[] = [
    ...(GATEWAY_URL
        ? [`https://${GATEWAY_URL}/ipfs/`]
        : []),
    "https://ipfs.io/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://dweb.link/ipfs/",
];

export function isRealCid(cid: string): boolean {
    return !/^Qm[0-9a-f]+$/i.test(cid);
}

export interface EncryptedUploadResult {
    recordId: string;
    cid: string;
    ciphertextSha256: string;

    encryption: {
        algorithm: "AES-256-GCM";
        iv: string;
        authTag: string;
        aad: string;
    };

    original: {
        name: string;
        mimeType: string;
        size: number;
    };

    createdAt: string;
}

/**
 * Upload a medical file.
 *
 * The browser sends the original file to the backend.
 * The backend encrypts it before storing it on Pinata/IPFS.
 */
export async function uploadEncryptedMedicalFile(
    file: File,
    patientWallet: string,
    onProgress?: (stage: string) => void,
): Promise<EncryptedUploadResult> {

    onProgress?.("Encrypting medical record…");

    const data = new FormData();

    data.append("file", file);
    data.append("patientWallet", patientWallet);

    const sendUpload = async (accessToken: string) => {
        return fetch(
            `${BACKEND_URL}/api/medical-records`,
            {
                method: "POST",

                headers: {
                    Authorization:
                        `Bearer ${accessToken}`,
                },

                body: data,
            },
        );
    };

    onProgress?.("Authenticating wallet…");

    let response = await sendUpload(
        await getWalletAccessToken(patientWallet),
    );

    /*
     * Backend sessions are stored in memory.
     * If the server restarted, renew the wallet session.
     */
    if (response.status === 401) {

        clearWalletAccessToken(patientWallet);

        onProgress?.(
            "Confirm the MetaMask signature to renew access…",
        );

        response = await sendUpload(
            await getWalletAccessToken(
                patientWallet,
                true,
            ),
        );
    }

    const body =
        await response
            .json()
            .catch(() => ({}));

    if (!response.ok) {

        throw new Error(
            body.error ||
            "Encrypted upload failed.",
        );
    }

    return body as EncryptedUploadResult;
}


/**
 * List medical records.
 *
 * IMPORTANT:
 * The backend returns:
 *
 * {
 *     recordId: "rec_...",
 *     cid: "...",
 *     ...
 * }
 *
 * recordId is the SAME ID used as the Fabric
 * documentId.
 */
export async function listMedicalRecords(
    patientWallet: string,
    requesterWallet: string,
): Promise<EncryptedUploadResult[]> {

    const url =
        `${BACKEND_URL}/api/medical-records` +
        `?patientWallet=${encodeURIComponent(
            patientWallet,
        )}`;

    const requestList =
        async (accessToken: string) => {

            return fetch(
                url,
                {
                    method: "GET",

                    headers: {
                        Authorization:
                            `Bearer ${accessToken}`,
                    },
                },
            );
        };

    let response = await requestList(
        await getWalletAccessToken(
            requesterWallet,
        ),
    );

    /*
     * Renew wallet session if necessary.
     */
    if (response.status === 401) {

        clearWalletAccessToken(
            requesterWallet,
        );

        response = await requestList(
            await getWalletAccessToken(
                requesterWallet,
                true,
            ),
        );
    }

    const body =
        await response
            .json()
            .catch(() => ({}));

    if (!response.ok) {

        throw new Error(
            body.error ||
            "Could not fetch records.",
        );
    }

    /*
     * Normalize the response.
     *
     * This is important because the frontend must use
     * recordId, NOT id, backendRecordId, or a newly
     * generated record ID.
     */
    const records =
        Array.isArray(body)
            ? body as EncryptedUploadResult[]
            : [];

    console.log(
        "[IPFS] Records received from backend:",
        records.map((record) => ({
            recordId: record.recordId,
            cid: record.cid,
            fileName:
            record.original?.name,
        })),
    );

    return records;
}


/**
 * Download and decrypt a medical record.
 *
 * IMPORTANT:
 *
 * recordId MUST be the actual Fabric documentId.
 *
 * Example:
 *
 * rec_1786637549368_ce122e66
 *
 * The request goes through the backend.
 *
 * DO NOT fetch the IPFS CID directly here.
 *
 * The backend performs:
 *
 * 1. Wallet authentication
 * 2. Fabric access authorization
 * 3. Record lookup
 * 4. IPFS retrieval
 * 5. SHA-256 verification
 * 6. AES-256-GCM decryption
 *
 * This prevents a doctor from bypassing the
 * Fabric authorization layer.
 */
export async function fetchDecryptedMedicalFile(
    recordId: string,
    requesterWallet: string,
): Promise<Blob> {

    /*
     * Validate the ID before making the request.
     */
    if (
        typeof recordId !== "string" ||
        recordId.trim().length === 0
    ) {
        throw new Error(
            "Medical record ID is missing.",
        );
    }

    /*
     * Validate wallet before making the request.
     */
    if (
        typeof requesterWallet !== "string" ||
        !/^0x[a-fA-F0-9]{40}$/.test(
            requesterWallet,
        )
    ) {
        throw new Error(
            "A valid requester wallet is required.",
        );
    }

    const cleanRecordId =
        recordId.trim();

    /*
     * IMPORTANT:
     *
     * Backend route:
     *
     * GET /api/medical-records/:recordId/download
     *
     * Therefore the Fabric document ID must
     * be placed in the URL.
     */
    const downloadUrl =
        `${BACKEND_URL}/api/medical-records/` +
        `${encodeURIComponent(
            cleanRecordId,
        )}/download`;

    console.log(
        "[IPFS] Requesting protected medical file:",
        {
            recordId: cleanRecordId,
            requesterWallet,
            url: downloadUrl,
        },
    );

    const requestDownload =
        async (accessToken: string) => {

            return fetch(
                downloadUrl,
                {
                    method: "GET",

                    headers: {
                        Authorization:
                            `Bearer ${accessToken}`,
                    },

                    /*
                     * Prevent browser caching of
                     * decrypted medical documents.
                     */
                    cache: "no-store",
                },
            );
        };

    /*
     * First attempt using the existing wallet session.
     */
    let response =
        await requestDownload(
            await getWalletAccessToken(
                requesterWallet,
            ),
        );

    /*
     * Session expired → renew MetaMask
     * authentication and retry once.
     */
    if (response.status === 401) {

        console.log(
            "[IPFS] Wallet session expired. Renewing...",
        );

        clearWalletAccessToken(
            requesterWallet,
        );

        const newAccessToken =
            await getWalletAccessToken(
                requesterWallet,
                true,
            );

        response =
            await requestDownload(
                newAccessToken,
            );
    }

    /*
     * Handle authorization/download errors.
     */
    if (!response.ok) {

        const body =
            await response
                .json()
                .catch(() => ({}));

        console.error(
            "[IPFS] Protected file request failed:",
            {
                status: response.status,
                recordId: cleanRecordId,
                error: body.error,
            },
        );

        throw new Error(
            body.error ||
            "Unable to decrypt this record.",
        );
    }

    /*
     * Backend returns the decrypted file as a Blob.
     */
    const blob =
        await response.blob();

    if (blob.size === 0) {

        throw new Error(
            "The decrypted medical record is empty.",
        );
    }

    console.log(
        "[IPFS] Protected medical file received:",
        {
            recordId: cleanRecordId,
            size: blob.size,
            type: blob.type,
        },
    );

    return blob;
}


/**
 * Legacy/mock IPFS retrieval.
 *
 * IMPORTANT:
 * Do not use this for authorized doctor records.
 *
 * It is retained only for old/mock records that
 * existed before encrypted backend downloads.
 */
export async function fetchFromIPFS(
    cid: string,
): Promise<Blob | null> {

    if (
        typeof cid !== "string" ||
        cid.trim().length === 0
    ) {
        return null;
    }

    for (
        const gateway of IPFS_GATEWAYS
        ) {

        try {

            const response =
                await fetch(
                    `${gateway}${encodeURIComponent(
                        cid,
                    )}`,
                    {
                        method: "GET",

                        /*
                         * Don't cache legacy
                         * IPFS responses.
                         */
                        cache: "no-store",

                        signal:
                            AbortSignal.timeout(
                                12_000,
                            ),
                    },
                );

            if (response.ok) {

                return response.blob();
            }

        } catch {
            /*
             * Try the next gateway.
             */
        }
    }

    return null;
}