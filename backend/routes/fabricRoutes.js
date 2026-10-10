/**
 * MediVault Fabric API routes.
 *
 * These routes enforce document-level, patient-controlled access via
 * the MediVault chaincode. Only the authenticated wallet is trusted:
 *   - Patients grant/revoke document access
 *   - Doctors list only documents they hold permission for
 *   - Insurance providers manage claims
 *
 * All routes require the wallet auth middleware (sets req.auth.walletAddress).
 */

import { Router } from 'express';
import { getFabricService } from '../middleware/fabricRecordAccess.js';

const router = Router();

function walletOf(req) {
    return String(req.auth?.walletAddress || '').trim().toLowerCase();
}

function handleError(res, error, context) {
    const message = error?.message || String(error);
    const isDenied = /unauthoriz/i.test(message);
    const isNotFound = /not found/i.test(message) && !/Fabric/i.test(message);
    const isSetup = /network setup|not found\. run|unavailable|UNAVAILABLE|connect/i.test(message);

    if (isDenied) return res.status(403).json({ error: message });
    if (isNotFound) return res.status(404).json({ error: message });
    if (isSetup) return res.status(503).json({ error: 'Fabric network is unavailable. Start the network and try again.' });
    console.error(`[Fabric:${context}]`, error);
    return res.status(500).json({ error: message });
}

// ─── Document-level access control ────────────────────────────────────────────

/**
 * POST /api/fabric/access/grant
 * body: { documentId, doctorWallet, permission?: 'VIEW', durationDays?: 1|7|30|0 }
 */
router.post('/access/grant', async (req, res) => {
    try {
        const { documentId, doctorWallet, permission, durationDays } = req.body || {};
        const patientWallet = walletOf(req);
        if (!documentId || !doctorWallet) {
            return res.status(400).json({ error: 'documentId and doctorWallet are required.' });
        }
        if (!patientWallet) {
            return res.status(401).json({ error: 'Authenticated patient wallet is required.' });
        }

        const service = await getFabricService();
        const result = await service.grantDocumentAccess({
            documentId,
            patientId: patientWallet,
            doctorId: String(doctorWallet).toLowerCase(),
            permission: permission || 'VIEW',
            durationDays: durationDays === undefined ? 7 : durationDays,
        });
        return res.status(201).json(result);
    } catch (error) {
        return handleError(res, error, 'access/grant');
    }
});

/**
 * POST /api/fabric/access/revoke
 * body: { documentId, doctorWallet }
 */
router.post('/access/revoke', async (req, res) => {
    try {
        const { documentId, doctorWallet } = req.body || {};
        const patientWallet = walletOf(req);
        if (!documentId || !doctorWallet) {
            return res.status(400).json({ error: 'documentId and doctorWallet are required.' });
        }
        if (!patientWallet) {
            return res.status(401).json({ error: 'Authenticated patient wallet is required.' });
        }

        const service = await getFabricService();
        const result = await service.revokeDocumentAccess(documentId, patientWallet, String(doctorWallet).toLowerCase());
        return res.json(result);
    } catch (error) {
        return handleError(res, error, 'access/revoke');
    }
});

/**
 * GET /api/fabric/access?documentId= — list permissions for a document (owner only)
 */
router.get('/access', async (req, res) => {
    try {
        const { documentId } = req.query;
        const patientWallet = walletOf(req);
        if (!documentId) return res.status(400).json({ error: 'documentId query param is required.' });
        if (!patientWallet) return res.status(401).json({ error: 'Authenticated wallet is required.' });

        const service = await getFabricService();
        const permissions = await service.getDocumentAccessList(documentId, patientWallet);
        return res.json(permissions);
    } catch (error) {
        return handleError(res, error, 'access/list');
    }
});

/**
 * GET /api/fabric/doctor/documents — documents the authenticated doctor may view
 */
router.get('/doctor/documents', async (req, res) => {
    try {
        const doctorWallet = walletOf(req);
        if (!doctorWallet) return res.status(401).json({ error: 'Authenticated doctor wallet is required.' });

        const service = await getFabricService();
        const documents = await service.getDoctorAuthorizedDocuments(doctorWallet, doctorWallet);
        return res.json(documents);
    } catch (error) {
        return handleError(res, error, 'doctor/documents');
    }
});

// ─── Audit trail ──────────────────────────────────────────────────────────────

/**
 * GET /api/fabric/audit/:documentId — audit history (owner only)
 */
router.get('/audit/:documentId', async (req, res) => {
    try {
        const patientWallet = walletOf(req);
        if (!patientWallet) return res.status(401).json({ error: 'Authenticated wallet is required.' });

        const service = await getFabricService();
        const events = await service.getAuditHistory(req.params.documentId, patientWallet);
        return res.json(events);
    } catch (error) {
        return handleError(res, error, 'audit/history');
    }
});

// ─── Prescriptions ─────────────────────────────────────────────────────────────

/**
 * POST /api/fabric/prescriptions
 * body: { prescriptionId?, patientWallet, appointmentId?, diagnosis, medicines, instructions?, followUpDate? }
 * The authenticated doctor is the author. medicines is an array of
 * { name, dosage, duration } objects.
 *
 * A prescription is visible to the patient immediately once created —
 * there is no separate "share" step, matching how a real prescription works.
 */
router.post('/prescriptions', async (req, res) => {
    try {
        const {
            prescriptionId,
            patientWallet,
            appointmentId,
            diagnosis,
            medicines,
            instructions,
            followUpDate,
        } = req.body || {};

        const doctorWallet = walletOf(req);

        if (!patientWallet || !diagnosis || !Array.isArray(medicines) || medicines.length === 0) {
            return res.status(400).json({
                error: 'patientWallet, diagnosis, and a non-empty medicines array are required.',
            });
        }
        if (!doctorWallet) {
            return res.status(401).json({ error: 'Authenticated doctor wallet is required.' });
        }

        const service = await getFabricService();
        const id =
            prescriptionId ||
            `rx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const prescription = await service.createPrescription({
            prescriptionId: id,
            patientId: String(patientWallet).toLowerCase(),
            doctorId: doctorWallet,
            appointmentId,
            diagnosis,
            medicines,
            instructions,
            followUpDate,
        });
        return res.status(201).json(prescription);
    } catch (error) {
        return handleError(res, error, 'prescriptions/create');
    }
});

/**
 * GET /api/fabric/prescriptions — the authenticated patient's full prescription history
 */
router.get('/prescriptions', async (req, res) => {
    try {
        const patientWallet = walletOf(req);
        if (!patientWallet) return res.status(401).json({ error: 'Authenticated wallet is required.' });

        const service = await getFabricService();
        const prescriptions = await service.getPatientPrescriptions(patientWallet, patientWallet);
        return res.json(prescriptions);
    } catch (error) {
        return handleError(res, error, 'prescriptions/list');
    }
});

/**
 * GET /api/fabric/prescriptions/:prescriptionId — get one prescription
 * (owner patient or issuing doctor only)
 */
router.get('/prescriptions/:prescriptionId', async (req, res) => {
    try {
        const requesterWallet = walletOf(req);
        if (!requesterWallet) return res.status(401).json({ error: 'Authenticated wallet is required.' });

        const service = await getFabricService();
        const prescription = await service.getPrescription(req.params.prescriptionId, requesterWallet);
        return res.json(prescription);
    } catch (error) {
        return handleError(res, error, 'prescriptions/get');
    }
});

/**
 * GET /api/fabric/doctor/prescriptions — prescriptions authored by the authenticated doctor
 */
router.get('/doctor/prescriptions', async (req, res) => {
    try {
        const doctorWallet = walletOf(req);
        if (!doctorWallet) return res.status(401).json({ error: 'Authenticated doctor wallet is required.' });

        const service = await getFabricService();
        const prescriptions = await service.getDoctorPrescriptions(doctorWallet, doctorWallet);
        return res.json(prescriptions);
    } catch (error) {
        return handleError(res, error, 'doctor/prescriptions');
    }
});

/**
 * POST /api/fabric/prescriptions/:prescriptionId/revoke
 * The authenticated doctor must be the issuing doctor.
 */
router.post('/prescriptions/:prescriptionId/revoke', async (req, res) => {
    try {
        const doctorWallet = walletOf(req);
        if (!doctorWallet) return res.status(401).json({ error: 'Authenticated doctor wallet is required.' });

        const service = await getFabricService();
        const prescription = await service.revokePrescription(req.params.prescriptionId, doctorWallet);
        return res.json(prescription);
    } catch (error) {
        return handleError(res, error, 'prescriptions/revoke');
    }
});

// ─── Insurance claims ─────────────────────────────────────────────────────────

/**
 * POST /api/fabric/claims
 * body: { claimId, documentId, insuranceProviderId, amount, currency }
 * The authenticated patient is the claimant.
 */
router.post('/claims', async (req, res) => {
    try {
        const { claimId, documentId, insuranceProviderId, amount, currency } = req.body || {};
        const patientWallet = walletOf(req);
        if (!claimId || !documentId || !insuranceProviderId || !amount) {
            return res.status(400).json({ error: 'claimId, documentId, insuranceProviderId and amount are required.' });
        }
        if (!patientWallet) return res.status(401).json({ error: 'Authenticated patient wallet is required.' });

        const service = await getFabricService();
        const claim = await service.createClaim({
            claimId,
            patientId: patientWallet,
            documentId,
            insuranceProviderId: String(insuranceProviderId).toLowerCase(),
            amount,
            currency,
        });
        return res.status(201).json(claim);
    } catch (error) {
        return handleError(res, error, 'claims/create');
    }
});

/**
 * POST /api/fabric/claims/:claimId/status
 * body: { status } — the authenticated insurance provider updates the claim
 */
router.post('/claims/:claimId/status', async (req, res) => {
    try {
        const { status } = req.body || {};
        const providerId = walletOf(req);
        if (!status) return res.status(400).json({ error: 'status is required.' });
        if (!providerId) return res.status(401).json({ error: 'Authenticated provider wallet is required.' });

        const service = await getFabricService();
        const claim = await service.updateClaimStatus(req.params.claimId, status, providerId);
        return res.json(claim);
    } catch (error) {
        return handleError(res, error, 'claims/status');
    }
});

/**
 * GET /api/fabric/claims — the authenticated patient's claims
 */
router.get('/claims', async (req, res) => {
    try {
        const patientWallet = walletOf(req);
        if (!patientWallet) return res.status(401).json({ error: 'Authenticated wallet is required.' });

        const service = await getFabricService();
        const claims = await service.getPatientClaims(patientWallet, patientWallet);
        return res.json(claims);
    } catch (error) {
        return handleError(res, error, 'claims/list');
    }
});

/**
 * GET /api/fabric/claims/:claimId — get one claim
 */
router.get('/claims/:claimId', async (req, res) => {
    try {
        const service = await getFabricService();
        const claim = await service.getClaim(req.params.claimId);
        return res.json(claim);
    } catch (error) {
        return handleError(res, error, 'claims/get');
    }
});

export default router;