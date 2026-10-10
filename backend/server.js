import express from "express";
import cors from "cors";
import multer from "multer";
import FormData from "form-data";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { EncryptionService } from "./services/EncryptionService.js";
import { DecryptionService } from "./services/DecryptionService.js";
import { createEncryptUploadMiddleware } from "./middleware/encryptUpload.js";
import {
    createRequireRecordAccess,
} from "./middleware/recordAccess.js";
import {
    createRequireFabricRecordAccess,
    getFabricService,
} from "./middleware/fabricRecordAccess.js";
import fabricRoutes from "./routes/fabricRoutes.js";
import { WalletAuthService } from "./services/WalletAuthService.js";


// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({
    path: join(__dirname, ".env"),
});

const app = express();

const upload = multer({
    limits: {
        fileSize: 25 * 1024 * 1024,
    },
});

const encryptionService = new EncryptionService();
const decryptionService = new DecryptionService();
const encryptUpload =
    createEncryptUploadMiddleware(encryptionService);

const walletAuthService = new WalletAuthService();


// ══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════════

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin(origin, callback) {
            // Health checks and server-to-server requests have no Origin.
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error("Origin is not allowed by CORS"));
        },
        methods: [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS",
        ],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Wallet-Address",
        ],
    })
);

app.use(express.json());


// ══════════════════════════════════════════════════════════════════════════════
// WALLET AUTHENTICATION
// ══════════════════════════════════════════════════════════════════════════════

function requireWalletAuthentication(req, res, next) {
    const walletAddress =
        walletAuthService.getAuthenticatedWallet(
            req.get("authorization")
        );

    if (!walletAddress) {
        return res.status(401).json({
            error:
                "Authenticate your wallet to access encrypted records.",
        });
    }

    req.auth = {
        walletAddress,
    };

    // Convenience alias used throughout the record routes below
    // (download, secure-export, audit events, etc).
    req.requesterWallet = walletAddress;

    return next();
}


// ══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.post("/api/auth/challenge", (req, res) => {
    try {
        const challenge =
            walletAuthService.createChallenge(
                req.body?.wallet,
                req.get("host") || "MediVault"
            );

        return res.json(challenge);
    } catch (error) {
        return res.status(400).json({
            error: error.message,
        });
    }
});


app.post("/api/auth/verify", (req, res) => {
    try {
        const session =
            walletAuthService.verifyChallenge(
                req.body?.wallet,
                req.body?.signature
            );

        return res.json(session);
    } catch (error) {
        return res.status(401).json({
            error: error.message,
        });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// FILE-BACKED DATABASE
// ══════════════════════════════════════════════════════════════════════════════

const DB = join(__dirname, "connections.json");


function loadDB() {
    try {
        if (existsSync(DB)) {
            return JSON.parse(
                readFileSync(DB, "utf8")
            );
        }
    } catch (error) {
        console.error(
            "[DB] Load error:",
            error.message
        );
    }

    return {
        connections: [],
        appointments: [],
        records: [],
        notifications: [],
    };
}


const db = loadDB();

let connections = db.connections || [];
let appointments = db.appointments || [];
let records = db.records || [];
let notifications = db.notifications || [];


function saveDB() {
    try {
        writeFileSync(
            DB,
            JSON.stringify(
                {
                    ...db,
                    connections,
                    appointments,
                    records,
                    notifications,
                },
                null,
                2
            )
        );
    } catch (error) {
        console.error(
            "[DB] Save error:",
            error.message
        );
    }
}


const fakeTx = () =>
    "0x" + crypto.randomBytes(32).toString("hex");


// ══════════════════════════════════════════════════════════════════════════════
// ACCESS CONTROL MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════════

const requireRecordAccess =
    createRequireRecordAccess({
        records,
        connections,
    });


// Fabric-backed document-level access control
const fabricRecordAccess =
    createRequireFabricRecordAccess({
        records,
    });


// Fabric API routes
app.use(
    "/api/fabric",
    requireWalletAuthentication,
    fabricRoutes
);


console.log(
    `[DB] Loaded: ${connections.length} connections, ` +
    `${records.length} encrypted records, ` +
    `${notifications.length} notifications`
);


connections.forEach((connection) => {
    console.log(
        `  - [${connection.status}] ` +
        `${connection.patientWallet.slice(0, 10)}… → ` +
        `${connection.doctorWallet.slice(0, 10)}… ` +
        `(id: ${connection.id})`
    );
});


// ══════════════════════════════════════════════════════════════════════════════
// ENCRYPTED MEDICAL RECORD UPLOAD
// ══════════════════════════════════════════════════════════════════════════════

async function uploadEncryptedMedicalRecord(req, res) {

    const encryptedUpload = req.encryptedUpload;

    if (!encryptedUpload) {
        return res.status(400).json({
            error: "Encrypted upload data is missing.",
        });
    }

    const patientWallet =
        typeof req.body.patientWallet === "string"
            ? req.body.patientWallet.trim().toLowerCase()
            : "";

    if (!/^0x[a-f0-9]{40}$/.test(patientWallet)) {
        encryptedUpload?.buffer?.fill(0);

        return res.status(400).json({
            error:
                "A valid patientWallet is required.",
        });
    }

    const recordId =
        `rec_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;


    try {

        // ──────────────────────────────────────────────────────────────────────
        // PINATA CONFIGURATION
        // ──────────────────────────────────────────────────────────────────────

        const jwt = process.env.PINATA_JWT;

        if (!jwt) {
            return res.status(500).json({
                error:
                    "PINATA_JWT is not configured on the server.",
            });
        }


        // ──────────────────────────────────────────────────────────────────────
        // UPLOAD ENCRYPTED FILE TO PINATA/IPFS
        // ──────────────────────────────────────────────────────────────────────

        const fd = new FormData();

        // Never use the original filename as the IPFS filename.
        // This prevents unnecessary PHI exposure.
        fd.append(
            "file",
            encryptedUpload.buffer,
            {
                filename: `${recordId}.enc`,
                contentType:
                    "application/octet-stream",
            }
        );

        fd.append(
            "pinataMetadata",
            JSON.stringify({
                name: `${recordId}.enc`,
            })
        );

        fd.append(
            "pinataOptions",
            JSON.stringify({
                cidVersion: 1,
            })
        );


        const response = await axios.post(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            fd,
            {
                headers: {
                    ...fd.getHeaders(),
                    Authorization:
                        `Bearer ${jwt}`,
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            }
        );


        // ──────────────────────────────────────────────────────────────────────
        // HASH ENCRYPTED CONTENT
        // ──────────────────────────────────────────────────────────────────────

        const ciphertextSha256 =
            crypto
                .createHash("sha256")
                .update(encryptedUpload.buffer)
                .digest("hex");


        // ──────────────────────────────────────────────────────────────────────
        // CREATE LOCAL RECORD
        // ──────────────────────────────────────────────────────────────────────

        const record = {
            id: recordId,
            patientWallet,
            cid: response.data.IpfsHash,
            ciphertextSha256,
            original: encryptedUpload.original,
            encryption: encryptedUpload.encryption,
            createdAt:
                new Date().toISOString(),
        };


        records.push(record);
        saveDB();


        console.log(
            `[Upload] Encrypted record stored: ` +
            `${record.id} → ${record.cid}`
        );


        // ──────────────────────────────────────────────────────────────────────
        // REGISTER RECORD ON FABRIC
        // ──────────────────────────────────────────────────────────────────────

        try {

            const fabricService =
                await getFabricService();


            await fabricService.createMedicalRecord({
                documentId: record.id,
                patientId: patientWallet,
                cid: record.cid,
                sha256Hash:
                record.ciphertextSha256,
                documentType:
                    req.body.documentType ||
                    "MEDICAL_DOCUMENT",
                fileName:
                record.original.name,
            });


            console.log(
                `[Upload] On-chain metadata registered for ` +
                `${record.id}`
            );

            // ────────────────────────────────────────────────────────────────
            // NOTIFY PATIENT: NEW FILE ADDED
            // ────────────────────────────────────────────────────────────────

            createNotificationInternal({
                recipientWallet: patientWallet,
                actorWallet: patientWallet,
                type: "FILE_ADDED",
                title: "New record added",
                message: `${record.original?.name || "A document"} was added to your vault.`,
                metadata: {
                    recordId: record.id,
                    cid: record.cid,
                },
            });

        } catch (fabricError) {

            // Roll back local record if Fabric registration fails.
            const index =
                records.findIndex(
                    (item) =>
                        item.id === record.id
                );


            if (index !== -1) {
                records.splice(index, 1);
            }


            saveDB();


            console.error(
                "[Upload] On-chain registration failed:",
                fabricError.message
            );


            return res.status(503).json({
                error:
                    `File pinned to IPFS but on-chain ` +
                    `registration failed: ${fabricError.message}. ` +
                    `Start the Fabric network and retry.`,
            });
        }


        // ──────────────────────────────────────────────────────────────────────
        // SUCCESS
        // ──────────────────────────────────────────────────────────────────────

        return res.status(201).json({
            recordId: record.id,
            cid: record.cid,
            ciphertextSha256:
            record.ciphertextSha256,
            encryption:
            record.encryption,
            original:
            record.original,
            createdAt:
            record.createdAt,
        });


    } catch (error) {

        console.error(
            "[Upload] Error:",
            error.response?.data ||
            error.message
        );


        return res.status(500).json({
            error:
                "Encrypted upload failed.",
        });

    } finally {

        encryptedUpload?.buffer?.fill(0);

    }
}


// Upload routes
app.post(
    "/api/medical-records",
    requireWalletAuthentication,
    upload.single("file"),
    encryptUpload,
    uploadEncryptedMedicalRecord
);


app.post(
    "/upload",
    requireWalletAuthentication,
    upload.single("file"),
    encryptUpload,
    uploadEncryptedMedicalRecord
);


// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC RECORD METADATA
// ══════════════════════════════════════════════════════════════════════════════

function publicRecordMetadata(record) {

    return {
        recordId: record.id,
        cid: record.cid,
        ciphertextSha256:
        record.ciphertextSha256,
        encryption:
        record.encryption,
        original:
        record.original,
        createdAt:
        record.createdAt,
    };

}


// ══════════════════════════════════════════════════════════════════════════════
// WALLET NORMALIZATION
// ══════════════════════════════════════════════════════════════════════════════

function normaliseRecordWallet(value) {

    return typeof value === "string"
        ? value.trim().toLowerCase()
        : "";

}


// ══════════════════════════════════════════════════════════════════════════════
// LEGACY CONNECTION ACCESS CHECK
// ══════════════════════════════════════════════════════════════════════════════

function canAccessPatientRecords(
    requesterWallet,
    patientWallet
) {

    return (
        requesterWallet === patientWallet ||
        connections.some(
            (connection) =>
                connection.status === "CONNECTED" &&
                connection.patientWallet ===
                patientWallet &&
                connection.doctorWallet ===
                requesterWallet
        )
    );

}


// ══════════════════════════════════════════════════════════════════════════════
// LIST MEDICAL RECORDS
// ══════════════════════════════════════════════════════════════════════════════
//
// IMPORTANT:
//
// Fabric is now the source of truth for which document IDs are valid.
//
// Patient:
//     GetPatientRecords(patientWallet, patientWallet)
//
// Doctor:
//     GetPatientRecords(patientWallet, doctorWallet)
//
// The local `records[]` array is then intersected with Fabric records.
//
// This prevents stale local records such as:
//     rec_1786615817827
//
// from appearing in the frontend and being sent to
// GrantDocumentAccess.
//

app.get(
    "/api/medical-records",
    requireWalletAuthentication,
    async (req, res) => {

        const patientWallet =
            normaliseRecordWallet(
                req.query.patientWallet
            );


        if (
            !/^0x[a-f0-9]{40}$/.test(
                patientWallet
            )
        ) {

            return res.status(400).json({
                error:
                    "A valid patientWallet query parameter is required.",
            });

        }


        const requesterWallet =
            normaliseRecordWallet(
                req.auth.walletAddress
            );


        const isOwner =
            requesterWallet === patientWallet;


        try {

            // ────────────────────────────────────────────────────────────────
            // QUERY FABRIC
            // ────────────────────────────────────────────────────────────────

            const fabricService =
                await getFabricService();


            /*
             * For the patient:
             *
             *     patientWallet = owner
             *     requesterWallet = same patient
             *
             * For doctor:
             *
             *     patientWallet = owner
             *     requesterWallet = doctor
             *
             * Chaincode decides which documents are visible.
             */

            const fabricRecords =
                await fabricService.getPatientRecords(
                    patientWallet,
                    requesterWallet
                );


            // ────────────────────────────────────────────────────────────────
            // CREATE FABRIC RECORD MAP
            // ────────────────────────────────────────────────────────────────

            const fabricRecordMap =
                new Map(
                    (fabricRecords || []).map(
                        (fabricRecord) => [
                            fabricRecord.documentId,
                            fabricRecord,
                        ]
                    )
                );


            // ────────────────────────────────────────────────────────────────
            // INTERSECT LOCAL RECORDS WITH FABRIC
            // ────────────────────────────────────────────────────────────────

            const visibleRecords =
                records
                    .filter(
                        (record) =>
                            record.patientWallet ===
                            patientWallet &&
                            fabricRecordMap.has(
                                record.id
                            )
                    )
                    .sort(
                        (left, right) =>
                            Date.parse(
                                right.createdAt
                            ) -
                            Date.parse(
                                left.createdAt
                            )
                    )
                    .map(
                        publicRecordMetadata
                    );


            console.log(
                `[List] ` +
                `${isOwner ? "Patient" : "Doctor"} ` +
                `${requesterWallet.slice(0, 10)}… ` +
                `→ ${visibleRecords.length} ` +
                `Fabric-authorized records`
            );


            return res.json(
                visibleRecords
            );


        } catch (error) {

            const message =
                error?.message || "";


            console.error(
                "[List] Fabric record listing failed:",
                message
            );


            const isSetupError =
                /network setup|not found|unavailable|UNAVAILABLE|connect|channel/i
                    .test(message);


            return res.status(
                isSetupError ? 503 : 500
            ).json({

                error:
                    isSetupError
                        ? "Fabric network is unavailable. Start the network and try again."
                        : "Unable to retrieve medical records from Fabric.",

            });

        }

    }
);


// ══════════════════════════════════════════════════════════════════════════════
// PINATA/IPFS RETRIEVAL
// ══════════════════════════════════════════════════════════════════════════════

function encryptedRecordUrl(cid) {

    const gatewayHost =
        (
            process.env.PINATA_GATEWAY_URL ||
            "gateway.pinata.cloud"
        )
            .replace(/^https?:\/\//, "")
            .replace(/\/$/, "");


    return (
        `https://${gatewayHost}/ipfs/` +
        `${encodeURIComponent(cid)}`
    );

}


function encryptedRecordGatewayHeaders() {

    /*
     * This is a gateway access token/key.
     * It is NOT the API JWT used for uploading.
     */

    const gatewayToken =
        process.env.PINATA_GATEWAY_TOKEN ||
        process.env.PINATA_GATEWAY_KEY ||
        process.env.PINATA_GATEWAY_JWT;


    return gatewayToken
        ? {
            "x-pinata-gateway-token":
            gatewayToken,
        }
        : null;

}


function publicEncryptedRecordUrls(cid) {

    const encodedCid =
        encodeURIComponent(cid);


    return [
        `https://ipfs.io/ipfs/${encodedCid}`,
        `https://dweb.link/ipfs/${encodedCid}`,
    ];

}


async function retrieveEncryptedRecord(cid) {

    const primaryUrl =
        encryptedRecordUrl(cid);


    const primaryHeaders =
        encryptedRecordGatewayHeaders() ||
        undefined;


    const urls = [
        ...new Set([
            primaryUrl,
            ...publicEncryptedRecordUrls(cid),
        ]),
    ];


    let lastError;


    for (const url of urls) {

        try {

            const isConfiguredGateway =
                url === primaryUrl;


            const response =
                await axios.get(
                    url,
                    {
                        headers:
                            isConfiguredGateway
                                ? primaryHeaders
                                : undefined,

                        responseType:
                            "arraybuffer",

                        maxContentLength:
                            30 * 1024 * 1024,

                        maxBodyLength:
                            30 * 1024 * 1024,

                        timeout: 20_000,
                    }
                );


            return Buffer.from(
                response.data
            );


        } catch (error) {

            lastError = error;

        }

    }


    throw (
        lastError ||
        new Error(
            "Encrypted record could not be retrieved from IPFS."
        )
    );

}


// ══════════════════════════════════════════════════════════════════════════════
// INTEGRITY CHECK
// ══════════════════════════════════════════════════════════════════════════════

function matchesStoredCiphertextHash(
    ciphertext,
    expectedHash
) {

    const actualHash =
        crypto
            .createHash("sha256")
            .update(ciphertext)
            .digest("hex");


    return crypto.timingSafeEqual(
        Buffer.from(actualHash, "hex"),
        Buffer.from(expectedHash, "hex")
    );

}


// ══════════════════════════════════════════════════════════════════════════════
// GET SINGLE MEDICAL RECORD
// ══════════════════════════════════════════════════════════════════════════════

app.get(
    "/api/medical-records/:recordId",
    requireWalletAuthentication,
    fabricRecordAccess,
    (req, res) => {

        return res.json(
            publicRecordMetadata(
                req.record
            )
        );

    }
);


// ══════════════════════════════════════════════════════════════════════════════
// DOWNLOAD / DECRYPT MEDICAL RECORD
// ══════════════════════════════════════════════════════════════════════════════

app.get(
    "/api/medical-records/:recordId/download",
    requireWalletAuthentication,
    fabricRecordAccess,
    async (req, res) => {

        let ciphertext;


        try {

            // ────────────────────────────────────────────────────────────────
            // RETRIEVE ENCRYPTED FILE
            // ────────────────────────────────────────────────────────────────

            ciphertext =
                await retrieveEncryptedRecord(
                    req.record.cid
                );


            // ────────────────────────────────────────────────────────────────
            // VERIFY HASH
            // ────────────────────────────────────────────────────────────────

            if (
                !matchesStoredCiphertextHash(
                    ciphertext,
                    req.record.ciphertextSha256
                )
            ) {

                return res.status(422).json({
                    error:
                        "Encrypted record integrity check failed.",
                });

            }


            // ────────────────────────────────────────────────────────────────
            // DECRYPT
            // ────────────────────────────────────────────────────────────────

            const plaintext =
                decryptionService.decrypt(
                    ciphertext,
                    req.record.encryption
                );


            res.set(
                "Cache-Control",
                "no-store"
            );


            res.type(
                req.record.original.mimeType ||
                "application/octet-stream"
            );


            res.attachment(
                req.record.original.name ||
                "medical-record"
            );


            // ────────────────────────────────────────────────────────────────
            // AUDIT DOCUMENT VIEW + NOTIFY PATIENT
            // ────────────────────────────────────────────────────────────────

            if (
                req.requesterWallet &&
                req.requesterWallet !==
                req.record.patientWallet
            ) {

                try {

                    const fabricService =
                        await getFabricService();


                    await fabricService.recordAuditEvent({
                        documentId:
                        req.record.id,

                        patientId:
                        req.record.patientWallet,

                        doctorId:
                        req.requesterWallet,

                        action:
                            "DOCUMENT_VIEWED",

                        details:
                            `Record viewed by ${req.requesterWallet}`,
                    });


                    // ──────────────────────────────────────────────────────
                    // NOTIFY PATIENT: DOCTOR VIEWED THEIR FILE
                    // ──────────────────────────────────────────────────────

                    const relatedConnection =
                        connections.find(
                            (connection) =>
                                connection.patientWallet ===
                                req.record.patientWallet &&
                                connection.doctorWallet ===
                                req.requesterWallet &&
                                connection.status ===
                                "CONNECTED"
                        );


                    createNotificationInternal({
                        recipientWallet:
                        req.record.patientWallet,

                        actorWallet:
                        req.requesterWallet,

                        type:
                            "DOCUMENT_ACCESSED",

                        title:
                            "Your file was viewed",

                        message:
                            `${relatedConnection?.doctorName || "A doctor"} ` +
                            `viewed "${req.record.original?.name || "a document"}" ` +
                            `in your vault.`,

                        metadata: {
                            recordId:
                            req.record.id,
                            documentId:
                            req.record.id,
                        },
                    });


                } catch (auditError) {

                    console.warn(
                        "[Download] Audit event failed:",
                        auditError.message
                    );

                }

            }


            return res.send(
                plaintext
            );


        } catch (error) {

            if (
                error.code ===
                "DECRYPTION_FAILED"
            ) {

                return res.status(422).json({
                    error:
                        "Encrypted record integrity check failed.",
                });

            }


            console.error(
                "[Download] Error:",
                error.response?.status ||
                error.message
            );


            return res.status(502).json({
                error:
                    "Unable to retrieve the encrypted record.",
            });


        } finally {

            ciphertext?.fill(0);

        }

    }
);


// ══════════════════════════════════════════════════════════════════════════════
// SECURE EXPORT — ENCRYPTED CIPHERTEXT, NEVER DECRYPTED
// ══════════════════════════════════════════════════════════════════════════════
//
// Doctor clicks Secure Export
//           ↓
// Fabric authorization      (fabricRecordAccess middleware)
//           ↓
// Retrieve encrypted IPFS object   (retrieveEncryptedRecord)
//           ↓
// SHA-256 verification      (matchesStoredCiphertextHash)
//           ↓
// ❌ NO DECRYPTION
//           ↓
// Download: MedicalVault_rec_xxx.mvault
//
// This route intentionally shares its access-control and integrity
// logic with /download, but never calls decryptionService — the
// ciphertext that comes back from IPFS is streamed to the client
// unmodified, wrapped only in a .mvault filename.
//

app.get(
    "/api/medical-records/:recordId/secure-export",
    requireWalletAuthentication,
    fabricRecordAccess,
    async (req, res) => {

        let ciphertext;


        try {

            // ────────────────────────────────────────────────────────────────
            // RETRIEVE ENCRYPTED FILE FROM IPFS
            // ────────────────────────────────────────────────────────────────

            ciphertext =
                await retrieveEncryptedRecord(
                    req.record.cid
                );


            // ────────────────────────────────────────────────────────────────
            // VERIFY INTEGRITY (SHA-256 of ciphertext, same as /download)
            // ────────────────────────────────────────────────────────────────

            if (
                !matchesStoredCiphertextHash(
                    ciphertext,
                    req.record.ciphertextSha256
                )
            ) {

                return res.status(422).json({
                    error:
                        "Encrypted record integrity check failed.",
                });

            }


            // ────────────────────────────────────────────────────────────────
            // NO DECRYPTION — SEND CIPHERTEXT AS-IS
            // ────────────────────────────────────────────────────────────────

            res.set(
                "Cache-Control",
                "no-store"
            );


            res.type(
                "application/octet-stream"
            );


            res.attachment(
                `MedicalVault_${req.record.id}.mvault`
            );


            // ────────────────────────────────────────────────────────────────
            // AUDIT THE EXPORT
            // ────────────────────────────────────────────────────────────────

            if (
                req.requesterWallet &&
                req.requesterWallet !==
                req.record.patientWallet
            ) {

                try {

                    const fabricService =
                        await getFabricService();


                    await fabricService.recordAuditEvent({
                        documentId:
                        req.record.id,

                        patientId:
                        req.record.patientWallet,

                        doctorId:
                        req.requesterWallet,

                        action:
                            "DOCUMENT_EXPORTED",

                        details:
                            `Encrypted export downloaded by ${req.requesterWallet}`,
                    });


                } catch (auditError) {

                    console.warn(
                        "[SecureExport] Audit event failed:",
                        auditError.message
                    );

                }

            }


            return res.send(
                ciphertext
            );


        } catch (error) {

            console.error(
                "[SecureExport] Error:",
                error.response?.status ||
                error.message
            );


            return res.status(502).json({
                error:
                    "Unable to retrieve the encrypted record.",
            });

            // NOTE: unlike /download, ciphertext is not zeroed in a
            // `finally` block here — it IS the response payload being
            // streamed via res.send(), so wiping it could race the
            // socket write and truncate/corrupt the .mvault download.
            // It's also lower sensitivity than the plaintext PHI that
            // /download handles, so letting it get GC'd normally is fine.

        }

    }
);


// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════
//
// Backs services/notificationService.ts on the frontend:
//
//   GET  /api/notifications/:wallet          → getNotifications()
//   POST /api/notifications                  → createNotification()
//   POST /api/notifications/:id/read         → markNotificationRead()
//   POST /api/notifications/:wallet/read-all → markAllNotificationsRead()
//
// Stored in the same file-backed DB as connections/records/appointments.
//

const NOTIFICATION_TYPES = new Set([
    "WALLET_CONNECTED",
    "FILE_ADDED",
    "PRESCRIPTION",
    "APPOINTMENT",
    "ACCESS_GRANTED",
    "ACCESS_REVOKED",
    "CONNECTION_REQUEST",
    "EMERGENCY",
    "SYSTEM",
    "DOCUMENT_ACCESSED",
]);


function normaliseWallet(value) {

    return typeof value === "string"
        ? value.trim().toLowerCase()
        : "";

}


// Shared creation helper — used both by the POST /api/notifications route
// and internally by other routes (upload, connection accept, download, etc.)
// that want to raise a notification as a side effect.
function createNotificationInternal({
                                        recipientWallet,
                                        actorWallet,
                                        type,
                                        title,
                                        message,
                                        metadata,
                                    }) {

    const recipient =
        normaliseWallet(recipientWallet);

    if (!recipient) {
        return null;
    }

    const notification = {

        id:
            `notif_${Date.now()}_` +
            `${crypto.randomBytes(4).toString("hex")}`,

        recipientWallet: recipient,

        actorWallet:
            actorWallet
                ? normaliseWallet(actorWallet)
                : undefined,

        type:
            NOTIFICATION_TYPES.has(type)
                ? type
                : "SYSTEM",

        title:
            typeof title === "string" && title.trim()
                ? title.trim()
                : "Notification",

        message:
            typeof message === "string"
                ? message.trim()
                : "",

        createdAt:
            new Date().toISOString(),

        read: false,

        metadata:
            metadata &&
            typeof metadata === "object"
                ? metadata
                : undefined,

    };

    notifications.push(notification);
    saveDB();

    console.log(
        `[Notify] ${notification.type} → ` +
        `${recipient.slice(0, 10)}… ` +
        `(id: ${notification.id})`
    );

    return notification;

}


// ──────────────────────────────────────────────────────────────────────────────
// LIST NOTIFICATIONS FOR A WALLET
// ──────────────────────────────────────────────────────────────────────────────

app.get(
    "/api/notifications/:wallet",
    (req, res) => {

        const wallet =
            normaliseWallet(
                req.params.wallet
            );

        if (!wallet) {
            return res.json([]);
        }

        const result =
            notifications
                .filter(
                    (notification) =>
                        notification.recipientWallet === wallet
                )
                .sort(
                    (left, right) =>
                        Date.parse(right.createdAt) -
                        Date.parse(left.createdAt)
                );

        return res.json(result);

    }
);


// ──────────────────────────────────────────────────────────────────────────────
// CREATE NOTIFICATION
// ──────────────────────────────────────────────────────────────────────────────

app.post(
    "/api/notifications",
    (req, res) => {

        const {
            recipientWallet,
            actorWallet,
            type,
            title,
            message,
            metadata,
        } = req.body || {};

        const recipient =
            normaliseWallet(recipientWallet);

        if (!recipient) {
            return res.status(400).json({
                error:
                    "A valid recipientWallet is required.",
            });
        }

        const notification =
            createNotificationInternal({
                recipientWallet: recipient,
                actorWallet,
                type,
                title,
                message,
                metadata,
            });

        return res.status(201).json(notification);

    }
);


// ──────────────────────────────────────────────────────────────────────────────
// MARK ONE NOTIFICATION READ
// ──────────────────────────────────────────────────────────────────────────────

app.post(
    "/api/notifications/:id/read",
    (req, res) => {

        const notification =
            notifications.find(
                (item) =>
                    item.id === req.params.id
            );

        if (!notification) {
            return res.status(404).json({
                error: "Notification not found.",
            });
        }

        notification.read = true;

        saveDB();

        return res.json(notification);

    }
);


// ──────────────────────────────────────────────────────────────────────────────
// MARK ALL NOTIFICATIONS READ FOR A WALLET
// ──────────────────────────────────────────────────────────────────────────────

app.post(
    "/api/notifications/:wallet/read-all",
    (req, res) => {

        const wallet =
            normaliseWallet(
                req.params.wallet
            );

        if (!wallet) {
            return res.json({ updated: 0 });
        }

        let updated = 0;

        notifications.forEach((notification) => {
            if (
                notification.recipientWallet === wallet &&
                !notification.read
            ) {
                notification.read = true;
                updated += 1;
            }
        });

        saveDB();

        return res.json({ updated });

    }
);


// ══════════════════════════════════════════════════════════════════════════════
// CONNECTION API
// ══════════════════════════════════════════════════════════════════════════════


// ──────────────────────────────────────────────────────────────────────────────
// REQUEST CONNECTION
// ──────────────────────────────────────────────────────────────────────────────

app.post(
    "/connection/request",
    (req, res) => {

        const {
            patientWallet,
            patientName,
            doctorWallet,
            doctorName,
        } = req.body;


        if (
            !patientWallet ||
            !doctorWallet
        ) {

            return res.status(400).json({
                error:
                    "patientWallet and doctorWallet required",
            });

        }


        const pw =
            patientWallet
                .toLowerCase()
                .trim();


        const dw =
            doctorWallet
                .toLowerCase()
                .trim();


        // Check existing connection
        const existing =
            connections.find(
                (connection) =>
                    connection.patientWallet === pw &&
                    connection.doctorWallet === dw &&
                    connection.status !== "REVOKED" &&
                    connection.status !== "REJECTED"
            );


        if (existing) {

            console.log(
                `[Request] Already exists: ${existing.status}`
            );


            return res.json({
                connection: existing,
                isNew: false,
            });

        }


        const conn = {

            id:
                `conn${Date.now()}` +
                `${crypto.randomBytes(3).toString("hex")}`,

            patientWallet: pw,

            doctorWallet: dw,

            patientName:
                patientName ||
                "Patient",

            doctorName:
                doctorName ||
                "Doctor",

            status:
                "PENDING",

            requestedAt:
                new Date().toISOString(),

            connectedAt:
                null,

            txHash:
                null,

        };


        connections.push(conn);

        saveDB();


        console.log(
            `[Request] NEW → ` +
            `patient:${pw.slice(0, 10)}… ` +
            `doctor:${dw.slice(0, 10)}… ` +
            `id:${conn.id}`
        );


        // ────────────────────────────────────────────────────────────────
        // NOTIFY PATIENT: NEW CONNECTION REQUEST
        // ────────────────────────────────────────────────────────────────

        createNotificationInternal({
            recipientWallet: pw,
            actorWallet: dw,
            type: "CONNECTION_REQUEST",
            title: "New connection request",
            message: `${conn.doctorName} requested access to your medical vault.`,
            metadata: { connectionId: conn.id },
        });


        return res.json({
            connection: conn,
            isNew: true,
        });

    }
);


// ──────────────────────────────────────────────────────────────────────────────
// DOCTOR CONNECTION POLL
// ──────────────────────────────────────────────────────────────────────────────

app.get(
    "/connection/doctor/:wallet",
    (req, res) => {

        const dw =
            req.params.wallet
                .toLowerCase()
                .trim();


        const result =
            connections.filter(
                (connection) =>
                    connection.doctorWallet === dw
            );


        console.log(
            `[Poll] Doctor ${dw.slice(0, 10)}… ` +
            `→ ${result.length} connections`
        );


        return res.json(result);

    }
);


// ──────────────────────────────────────────────────────────────────────────────
// PATIENT CONNECTION POLL
// ──────────────────────────────────────────────────────────────────────────────

app.get(
    "/connection/patient/:wallet",
    (req, res) => {

        const pw =
            req.params.wallet
                .toLowerCase()
                .trim();


        return res.json(
            connections.filter(
                (connection) =>
                    connection.patientWallet === pw
            )
        );

    }
);


// ──────────────────────────────────────────────────────────────────────────────
// ACCEPT CONNECTION
// ──────────────────────────────────────────────────────────────────────────────

app.post(
    "/connection/accept",
    async (req, res) => {

        const {
            patientWallet,
            doctorWallet,
        } = req.body;


        console.log(
            `[Accept] Searching: ` +
            `patient=${patientWallet} ` +
            `doctor=${doctorWallet}`
        );


        console.log(
            "[Accept] All pending:",
            connections
                .filter(
                    (connection) =>
                        connection.status ===
                        "PENDING"
                )
                .map(
                    (connection) => ({
                        p:
                        connection.patientWallet,
                        d:
                        connection.doctorWallet,
                        id:
                        connection.id,
                    })
                )
        );


        if (
            !patientWallet ||
            !doctorWallet
        ) {

            return res.status(400).json({
                error:
                    "patientWallet and doctorWallet required",
            });

        }


        const pw =
            patientWallet
                .toLowerCase()
                .trim();


        const dw =
            doctorWallet
                .toLowerCase()
                .trim();


        const conn =
            connections.find(
                (connection) =>
                    connection.patientWallet === pw &&
                    connection.doctorWallet === dw &&
                    connection.status === "PENDING"
            );


        if (!conn) {

            console.error(
                `[Accept] NOT FOUND. ` +
                `patient:${pw} doctor:${dw}`
            );


            console.error(
                "[Accept] Stored connections:",
                JSON.stringify(
                    connections,
                    null,
                    2
                )
            );


            return res.status(404).json({
                error:
                    "No pending connection found.",

                searched: {
                    patientWallet: pw,
                    doctorWallet: dw,
                },

                stored:
                    connections.map(
                        (connection) => ({
                            p:
                            connection.patientWallet,
                            d:
                            connection.doctorWallet,
                            status:
                            connection.status,
                        })
                    ),
            });

        }


        conn.status =
            "CONNECTED";

        conn.connectedAt =
            new Date().toISOString();

        conn.txHash =
            fakeTx();

        conn.consentOnChain =
            false;


        saveDB();


        // ────────────────────────────────────────────────────────────────
        // RECORD CONSENT ON FABRIC
        // ────────────────────────────────────────────────────────────────

        try {

            const fabricService =
                await getFabricService();


            await fabricService.grantConsent(
                pw,
                dw,
                "ALL_RECORDS",
                0
            );


            conn.consentOnChain =
                true;


            conn.consentTxId =
                "consent_" +
                Date.now();


            saveDB();


            console.log(
                `[Accept] Consent recorded on-chain: ` +
                `${pw.slice(0, 10)}… → ` +
                `${dw.slice(0, 10)}…`
            );


        } catch (error) {

            console.warn(
                `[Accept] On-chain consent not recorded ` +
                `(local only): ${error.message}`
            );

        }


        // ────────────────────────────────────────────────────────────────
        // NOTIFY DOCTOR: ACCESS GRANTED
        // ────────────────────────────────────────────────────────────────

        createNotificationInternal({
            recipientWallet: dw,
            actorWallet: pw,
            type: "ACCESS_GRANTED",
            title: "Access granted",
            message: `${conn.patientName} accepted your connection request.`,
            metadata: { connectionId: conn.id },
        });


        console.log(
            `[Accept] ✓ CONNECTED: ` +
            `${pw.slice(0, 10)}… ↔ ` +
            `${dw.slice(0, 10)}…`
        );


        return res.json(conn);

    }
);


// ──────────────────────────────────────────────────────────────────────────────
// REJECT CONNECTION
// ──────────────────────────────────────────────────────────────────────────────

app.post(
    "/connection/reject",
    (req, res) => {

        const {
            patientWallet,
            doctorWallet,
        } = req.body;


        const pw =
            (patientWallet || "")
                .toLowerCase()
                .trim();


        const dw =
            (doctorWallet || "")
                .toLowerCase()
                .trim();


        const conn =
            connections.find(
                (connection) =>
                    connection.patientWallet === pw &&
                    connection.doctorWallet === dw &&
                    connection.status === "PENDING"
            );


        if (!conn) {

            return res.status(404).json({
                error:
                    "No pending connection found",
            });

        }


        conn.status =
            "REJECTED";


        saveDB();


        console.log(
            `[Reject] ${pw.slice(0, 10)}… ↔ ` +
            `${dw.slice(0, 10)}…`
        );


        return res.json(conn);

    }
);


// ──────────────────────────────────────────────────────────────────────────────
// REVOKE CONNECTION
// ──────────────────────────────────────────────────────────────────────────────

app.post(
    "/connection/revoke",
    async (req, res) => {

        const {
            patientWallet,
            doctorWallet,
        } = req.body;


        const pw =
            (patientWallet || "")
                .toLowerCase()
                .trim();


        const dw =
            (doctorWallet || "")
                .toLowerCase()
                .trim();


        const conn =
            connections.find(
                (connection) =>
                    connection.patientWallet === pw &&
                    connection.doctorWallet === dw &&
                    connection.status === "CONNECTED"
            );


        if (!conn) {

            return res.status(404).json({
                error:
                    "No connected connection found",
            });

        }


        conn.status =
            "REVOKED";

        conn.revokedAt =
            new Date().toISOString();

        conn.consentOnChain =
            false;


        saveDB();


        try {

            const fabricService =
                await getFabricService();


            await fabricService.revokeConsent(
                pw,
                dw
            );


            console.log(
                `[Revoke] On-chain consent revoked: ` +
                `${pw.slice(0, 10)}… → ` +
                `${dw.slice(0, 10)}…`
            );


        } catch (error) {

            console.warn(
                `[Revoke] On-chain consent revoke failed ` +
                `(local only): ${error.message}`
            );

        }


        // ────────────────────────────────────────────────────────────────
        // NOTIFY DOCTOR: ACCESS REVOKED
        // ────────────────────────────────────────────────────────────────

        createNotificationInternal({
            recipientWallet: dw,
            actorWallet: pw,
            type: "ACCESS_REVOKED",
            title: "Access revoked",
            message: `${conn.patientName} revoked your access to their vault.`,
            metadata: { connectionId: conn.id },
        });


        return res.json(conn);

    }
);


// ══════════════════════════════════════════════════════════════════════════════
// APPOINTMENTS
// ══════════════════════════════════════════════════════════════════════════════

app.post(
    "/book-appointment",
    (req, res) => {

        const appt = {
            ...req.body,
            id:
                "apt_" +
                Date.now(),
        };


        appointments.push(appt);

        saveDB();


        // ────────────────────────────────────────────────────────────────
        // NOTIFY DOCTOR: NEW APPOINTMENT BOOKED
        // ────────────────────────────────────────────────────────────────

        if (appt.doctorId) {

            createNotificationInternal({
                recipientWallet: appt.doctorId,
                actorWallet: appt.patientWallet,
                type: "APPOINTMENT",
                title: "New appointment booked",
                message:
                    `${appt.doctorName || "An appointment"} was booked` +
                    `${appt.date ? ` for ${appt.date}` : ""}` +
                    `${appt.time ? ` at ${appt.time}` : ""}.`,
                metadata: { appointmentId: appt.id },
            });

        }


        return res.json(appt);

    }
);


// ══════════════════════════════════════════════════════════════════════════════
// LEGACY + DEBUG ROUTES
// ══════════════════════════════════════════════════════════════════════════════

app.get(
    "/access/:wallet",
    (req, res) =>
        res.json([])
);


app.post(
    "/grant-access",
    (req, res) =>
        res.json({
            ok: true,
        })
);


app.post(
    "/revoke-access",
    (req, res) =>
        res.json({
            ok: true,
        })
);


app.get(
    "/connection/all",
    (req, res) =>
        res.json(connections)
);


app.get(
    "/health",
    (req, res) =>
        res.json({
            ok: true,
            connections:
            connections.length,
            encryptedRecords:
            records.length,
            notifications:
            notifications.length,
        })
);


// ══════════════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════════════

app.get(
    "/",
    (req, res) =>
        res.send(`
            <html>
                <body
                    style="
                        font-family:monospace;
                        padding:2rem;
                        background:#050505;
                        color:#fff
                    "
                >

                    <h2 style="color:#10b981">
                        ✅ Medical Vault Backend
                    </h2>

                    <p>
                        Connections:
                        <b>${connections.length}</b>
                    </p>

                    <p>
                        Encrypted records:
                        <b>${records.length}</b>
                    </p>

                    <p>
                        Notifications:
                        <b>${notifications.length}</b>
                    </p>

                    <p>
                        Server-only Pinata JWT:
                        <b>
                            ${
            process.env.PINATA_JWT
                ? "✓ Set"
                : "✗ Missing"
        }
                        </b>
                    </p>

                    <p>

                            href="/connection/all"
                            style="color:#38bdf8"
                        >
                            View all connections →
                        </a>
                    </p>

                </body>
            </html>
        `)
);


// ══════════════════════════════════════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════════════════════════════════════

const PORT =
    process.env.PORT || 5000;


app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `\n✅ Medical Vault backend → ` +
            `http://localhost:${PORT}`
        );

        console.log(
            `    Server-only Pinata JWT: ` +
            `${
                process.env.PINATA_JWT
                    ? "✓ configured"
                    : "✗ missing"
            }\n`
        );

    }
);
