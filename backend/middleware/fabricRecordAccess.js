/**
 * MediVault Fabric Record Access Middleware
 *
 * Provides document-level access checks using Hyperledger Fabric.
 *
 * Supports both:
 *   /:documentId
 *   /:recordId
 *
 * The current MediVault download route uses :recordId, while Fabric
 * transactions use documentId. This middleware normalises both names
 * into one internal documentId value.
 */

import MediVaultFabricService from "../services/fabric/index.js";


// ══════════════════════════════════════════════════════════════════════════════
// FABRIC SERVICE SINGLETON
// ══════════════════════════════════════════════════════════════════════════════

let fabricServiceInstance = null;

export async function getFabricService() {
    if (!fabricServiceInstance) {
        fabricServiceInstance = new MediVaultFabricService();
    }

    return fabricServiceInstance;
}

// Allows the isolated route tests to supply an in-memory Fabric implementation.
// This is not exposed through HTTP and has no effect unless called by server code.
export function setFabricServiceForTests(service) {
    fabricServiceInstance = service;
}


// ══════════════════════════════════════════════════════════════════════════════
// WALLET NORMALISATION
// ══════════════════════════════════════════════════════════════════════════════

function normaliseWallet(wallet) {
    return String(wallet || "")
        .trim()
        .toLowerCase();
}


// ══════════════════════════════════════════════════════════════════════════════
// FABRIC RECORD ACCESS MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════════

export function createRequireFabricRecordAccess({
                                                    records = [],
                                                } = {}) {

    return async function requireFabricRecordAccess(req, res, next) {

        try {

            // ═══════════════════════════════════════════════════════════════
            // DOCUMENT / RECORD ID
            // ═══════════════════════════════════════════════════════════════
            //
            // IMPORTANT:
            //
            // The download route is:
            //
            //   /api/medical-records/:recordId/download
            //
            // while other Fabric routes may use:
            //
            //   /api/medical-records/:documentId
            //
            // Therefore accept BOTH.
            //

            const documentId =
                String(
                    req.params?.documentId ||
                    req.params?.recordId ||
                    req.body?.documentId ||
                    req.body?.recordId ||
                    req.query?.documentId ||
                    req.query?.recordId ||
                    ""
                ).trim();


            if (!documentId) {

                console.warn(
                    "[FabricAccess] Missing documentId/recordId",
                    {
                        params: req.params,
                        query: req.query,
                    }
                );

                return res.status(400).json({
                    error: "documentId is required.",
                });

            }


            console.log(
                `[FabricAccess] Checking document: ${documentId}`
            );


            // ═══════════════════════════════════════════════════════════════
            // REQUESTER WALLET
            // ═══════════════════════════════════════════════════════════════

            const requesterWallet =
                normaliseWallet(
                    req.auth?.walletAddress ||
                    req.body?.requesterWallet ||
                    req.query?.requesterWallet
                );


            if (!/^0x[a-f0-9]{40}$/.test(requesterWallet)) {

                console.warn(
                    "[FabricAccess] Invalid requester wallet"
                );

                return res.status(401).json({
                    error:
                        "A valid authenticated wallet is required.",
                });

            }


            // ═══════════════════════════════════════════════════════════════
            // FIND LOCAL RECORD
            // ═══════════════════════════════════════════════════════════════

            const localRecord =
                records.find(
                    (record) =>
                        String(record.id || "").trim() ===
                        documentId
                );


            if (!localRecord) {

                console.warn(
                    `[FabricAccess] Local record not found: ${documentId}`
                );

                return res.status(404).json({
                    error:
                        `Medical record ${documentId} was not found.`,
                });

            }


            // ═══════════════════════════════════════════════════════════════
            // PATIENT WALLET
            // ═══════════════════════════════════════════════════════════════

            const patientWallet =
                normaliseWallet(
                    localRecord.patientWallet ||
                    localRecord.patientId
                );


            if (!/^0x[a-f0-9]{40}$/.test(patientWallet)) {

                console.error(
                    `[FabricAccess] Invalid patient wallet for ${documentId}`
                );

                return res.status(500).json({
                    error:
                        "Medical record does not contain a valid patient wallet.",
                });

            }


            // ═══════════════════════════════════════════════════════════════
            // STORE RECORD ON REQUEST
            // ═══════════════════════════════════════════════════════════════
            //
            // The download route can use req.record after this middleware.
            //

            req.record = localRecord;


            // ═══════════════════════════════════════════════════════════════
            // PATIENT OWNS THE RECORD
            // ═══════════════════════════════════════════════════════════════

            if (requesterWallet === patientWallet) {

                console.log(
                    `[FabricAccess] OWNER access granted: ${documentId}`
                );

                req.fabricAccess = {
                    authorized: true,
                    documentId,
                    patientWallet,
                    requesterWallet,
                    isOwner: true,
                };

                return next();

            }


            // ═══════════════════════════════════════════════════════════════
            // DOCTOR / OTHER REQUESTER
            // ═══════════════════════════════════════════════════════════════

            const fabricService =
                await getFabricService();


            try {

                await fabricService.checkDocumentAccess(
                    documentId,
                    requesterWallet,
                    requesterWallet
                );


                console.log(
                    `[FabricAccess] Doctor access granted: ` +
                    `${requesterWallet.slice(0, 10)}… → ${documentId}`
                );


                req.fabricAccess = {
                    authorized: true,
                    documentId,
                    patientWallet,
                    requesterWallet,
                    isOwner: false,
                };


                return next();

            } catch (fabricError) {

                console.warn(
                    `[FabricAccess] Access denied: ` +
                    `${requesterWallet.slice(0, 10)}… → ${documentId}`
                );

                console.warn(
                    "[FabricAccess] Fabric reason:",
                    fabricError?.message
                );


                return res.status(403).json({
                    error:
                        "You do not have access to this medical record.",
                    documentId,
                });

            }

        } catch (error) {

            console.error(
                "[FabricAccess] Middleware error:",
                error
            );


            return res.status(500).json({
                error:
                    "Unable to verify Fabric record access.",
                details: error.message,
            });

        }

    };
}


// ══════════════════════════════════════════════════════════════════════════════
// OPTIONAL HELPER
// ══════════════════════════════════════════════════════════════════════════════

export function normaliseRecordWallet(wallet) {
    return normaliseWallet(wallet);
}
