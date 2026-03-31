import CryptoJS from 'crypto-js';

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;

/**
 * Encrypts a file using AES-256
 */
export const encryptFile = async (file: File, secretKey: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const fileData = CryptoJS.lib.WordArray.create(reader.result as any);
            const encrypted = CryptoJS.AES.encrypt(fileData, secretKey).toString();
            // We store the encrypted string as a Blob to upload to IPFS
            resolve(new Blob([encrypted], { type: 'text/plain' }));
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

/**
 * Uploads encrypted Blob to IPFS via Pinata
 */
export const uploadToIPFS = async (encryptedBlob: Blob, fileName: string) => {
    const data = new FormData();
    data.append('file', encryptedBlob, fileName);

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${PINATA_JWT}`,
        },
        body: data,
    });

    if (!res.ok) throw new Error("IPFS Upload Failed");
    const json = await res.json();
    return json.IpfsHash; // This is the CID/Fingerprint
};