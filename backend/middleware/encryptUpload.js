import path from "path";

const MAX_AAD_NAME_LENGTH = 255;

function normaliseWallet(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Converts Multer's in-memory upload into ciphertext before any storage client
 * receives it. IV and authentication tag are safe to store with the record;
 * the encryption key is intentionally never attached to req or metadata.
 */
export function createEncryptUploadMiddleware(encryptionService) {
    return (req, res, next) => {
        if (!req.file?.buffer) {
            return res.status(400).json({ error: "A medical file is required." });
        }

        const patientWallet = normaliseWallet(req.body?.patientWallet);
        if (!patientWallet) {
            req.file.buffer.fill(0);
            return res.status(400).json({ error: "patientWallet is required." });
        }
        if (req.auth?.walletAddress && patientWallet !== req.auth.walletAddress) {
            req.file.buffer.fill(0);
            return res.status(403).json({ error: "The authenticated wallet must own the uploaded record." });
        }

        const originalName = path.basename(req.file.originalname || "medical-record").slice(0, MAX_AAD_NAME_LENGTH);
        const aad = `medivault:v1:${patientWallet}:${originalName}`;
        const originalSize = req.file.size;
        const mimeType = req.file.mimetype || "application/octet-stream";

        try {
            const { ciphertext, metadata } = encryptionService.encrypt(req.file.buffer, { aad });

            req.encryptedUpload = {
                buffer: ciphertext,
                original: { name: originalName, mimeType, size: originalSize },
                encryption: { ...metadata, aad },
            };

            // The request no longer needs the plaintext after this point.
            req.file.buffer.fill(0);
            return next();
        } catch (error) {
            req.file.buffer.fill(0);
            return next(error);
        }
    };
}
