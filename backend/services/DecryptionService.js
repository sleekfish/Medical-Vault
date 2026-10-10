import crypto from "crypto";
import {
    AES_256_GCM,
    AES_256_KEY_BYTES,
    GCM_AUTH_TAG_BYTES,
    GCM_IV_BYTES,
    getEncryptionKeyFromEnvironment,
} from "./EncryptionService.js";

function decodeBase64(value, expectedBytes, fieldName) {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        throw new TypeError(`${fieldName} must be a valid base64 string.`);
    }
    const decoded = Buffer.from(value, "base64");
    if (decoded.length !== expectedBytes) {
        throw new TypeError(`${fieldName} has an invalid length.`);
    }
    return decoded;
}

/** Decrypts authenticated MediVault ciphertext after the access layer approves a request. */
export class DecryptionService {
    #key;

    constructor({ key = getEncryptionKeyFromEnvironment() } = {}) {
        if (!Buffer.isBuffer(key) || key.length !== AES_256_KEY_BYTES) {
            throw new TypeError("An AES-256-GCM key must be exactly 32 bytes.");
        }
        this.#key = key;
    }

    decrypt(ciphertext, { iv, authTag, aad } = {}) {
        if (!Buffer.isBuffer(ciphertext)) {
            throw new TypeError("ciphertext must be a Buffer");
        }

        const ivBuffer = decodeBase64(iv, GCM_IV_BYTES, "iv");
        const authTagBuffer = decodeBase64(authTag, GCM_AUTH_TAG_BYTES, "authTag");
        const decipher = crypto.createDecipheriv(AES_256_GCM, this.#key, ivBuffer, {
            authTagLength: GCM_AUTH_TAG_BYTES,
        });

        if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
        decipher.setAuthTag(authTagBuffer);

        try {
            return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        } catch {
            // Do not reveal whether the IV, tag, AAD, or ciphertext was altered.
            const error = new Error("Encrypted record failed integrity verification.");
            error.code = "DECRYPTION_FAILED";
            throw error;
        }
    }
}
