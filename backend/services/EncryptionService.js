import crypto from "crypto";

export const AES_256_GCM = "aes-256-gcm";
export const AES_256_KEY_BYTES = 32;
export const GCM_IV_BYTES = 12;
export const GCM_AUTH_TAG_BYTES = 16;

function encryptionConfigurationError(message) {
    const error = new Error(message);
    error.code = "ENCRYPTION_CONFIGURATION_ERROR";
    return error;
}

export function getEncryptionKeyFromEnvironment() {
    const encodedKey = process.env.ENCRYPTION_KEY_BASE64;
    if (!encodedKey) {
        throw encryptionConfigurationError(
            "ENCRYPTION_KEY_BASE64 is required and must contain a base64-encoded 32-byte key."
        );
    }

    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== AES_256_KEY_BYTES) {
        throw encryptionConfigurationError("ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes.");
    }
    return key;
}

function normalizeKey(key) {
    if (!Buffer.isBuffer(key) || key.length !== AES_256_KEY_BYTES) {
        throw encryptionConfigurationError("An AES-256-GCM key must be exactly 32 bytes.");
    }
    return key;
}

/**
 * Encrypts a buffer with AES-256-GCM. The key remains private to this service
 * and is never included in the returned encryption metadata.
 */
export class EncryptionService {
    #key;

    constructor({ key = getEncryptionKeyFromEnvironment() } = {}) {
        this.#key = normalizeKey(key);
    }

    encrypt(plaintext, { aad } = {}) {
        if (!Buffer.isBuffer(plaintext)) {
            throw new TypeError("plaintext must be a Buffer");
        }

        const iv = crypto.randomBytes(GCM_IV_BYTES);
        const cipher = crypto.createCipheriv(AES_256_GCM, this.#key, iv, {
            authTagLength: GCM_AUTH_TAG_BYTES,
        });

        if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));

        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return {
            ciphertext,
            metadata: {
                algorithm: "AES-256-GCM",
                iv: iv.toString("base64"),
                authTag: authTag.toString("base64"),
            },
        };
    }
}
