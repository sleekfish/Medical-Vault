/**
 * Backend tests for the Fabric-backed document-level access control.
 *
 * The Fabric SDK is never loaded: a mock service is injected via
 * `setFabricServiceForTests`, so these tests run with no Fabric network
 * and no installed @hyperledger packages.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createRequireFabricRecordAccess, setFabricServiceForTests } from '../middleware/fabricRecordAccess.js';
import fabricRoutes from '../routes/fabricRoutes.js';

const PATIENT = '0x1111111111111111111111111111111111111111';
const DOCTOR  = '0x2222222222222222222222222222222222222222';
const OTHER   = '0x3333333333333333333333333333333333333333';
const INSURANCE = '0x4444444444444444444444444444444444444444';

const RECORDS = [
    {
        id: 'rec_1',
        patientWallet: PATIENT,
        cid: 'QmTestCid1',
        ciphertextSha256: 'a'.repeat(64),
        createdAt: '2026-08-08T00:00:00.000Z',
    },
    {
        id: 'rec_2',
        patientWallet: PATIENT,
        cid: 'QmTestCid2',
        ciphertextSha256: 'b'.repeat(64),
        createdAt: '2026-08-08T00:00:00.000Z',
    },
];

// ─── Mock Fabric service ──────────────────────────────────────────────────────
function makeMockService(overrides = {}) {
    const service = {
        async checkDocumentAccess(documentId, doctorId) {
            if (doctorId !== DOCTOR) {
                throw new Error('Unauthorized: you do not have access to this document');
            }
            return { authorized: true, documentId, doctorId };
        },
        async grantDocumentAccess(data) {
            return { permissionId: 'perm_1', documentId: data.documentId, doctorId: data.doctorId, status: 'ACTIVE' };
        },
        async revokeDocumentAccess(documentId, patientId, doctorId) {
            return { permissionId: 'perm_1', documentId, doctorId, status: 'REVOKED' };
        },
        async getDocumentAccessList(documentId) {
            return [{ permissionId: 'perm_1', documentId, doctorId: DOCTOR, status: 'ACTIVE', expiresAt: null }];
        },
        async getDoctorAuthorizedDocuments(doctorId) {
            return [{ documentId: 'rec_1', patientId: PATIENT, fileName: 'blood.pdf', documentType: 'Blood Report' }];
        },
        async getAuditHistory(documentId) {
            return [{ eventId: 'evt_1', documentId, action: 'DOCUMENT_CREATED', timestamp: new Date().toISOString() }];
        },
        async getPatientRecords(patientId, requesterId) {
            return requesterId === DOCTOR
                ? [{ documentId: 'rec_1', patientId }]
                : [];
        },
        async createClaim(data) {
            return { claimId: data.claimId, documentId: data.documentId, status: 'SUBMITTED' };
        },
        async updateClaimStatus(claimId, status) {
            return { claimId, status };
        },
        async getClaim(claimId) {
            return { claimId, status: 'SUBMITTED' };
        },
        async getPatientClaims(patientId) {
            return [{ claimId: 'claim_1', patientId, status: 'SUBMITTED' }];
        },
        ...overrides,
    };
    return service;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function withServer(app, handler) {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    try {
        return await handler(base);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

function buildRecordApp(wallet, middleware) {
    const app = express();
    app.use((req, _res, next) => { req.auth = { walletAddress: wallet }; next(); });
    app.get('/api/medical-records/:recordId', middleware, (req, res) => {
        res.json({ ok: true, recordId: req.record?.id });
    });
    return app;
}

function buildFabricApp(wallet) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.auth = { walletAddress: wallet }; next(); });
    app.use('/api/fabric', fabricRoutes);
    return app;
}

// ─── Middleware tests ─────────────────────────────────────────────────────────
test('record access: owner bypasses Fabric check', async () => {
    const middleware = createRequireFabricRecordAccess({ records: RECORDS, service: makeMockService() });
    await withServer(buildRecordApp(PATIENT, middleware), async (base) => {
        const res = await fetch(`${base}/api/medical-records/rec_1`);
        assert.equal(res.status, 200);
        assert.equal((await res.json()).recordId, 'rec_1');
    });
});

test('record access: doctor WITH permission passes', async () => {
    const middleware = createRequireFabricRecordAccess({ records: RECORDS, service: makeMockService() });
    await withServer(buildRecordApp(DOCTOR, middleware), async (base) => {
        const res = await fetch(`${base}/api/medical-records/rec_1`);
        assert.equal(res.status, 200);
        assert.equal((await res.json()).recordId, 'rec_1');
    });
});

test('record access: doctor WITHOUT permission is denied 403', async () => {
    const middleware = createRequireFabricRecordAccess({ records: RECORDS, service: makeMockService() });
    await withServer(buildRecordApp(OTHER, middleware), async (base) => {
        const res = await fetch(`${base}/api/medical-records/rec_1`);
        assert.equal(res.status, 403);
        assert.match((await res.json()).error, /not authorized/i);
    });
});

test('record access: Fabric unreachable → 503 (deny closed)', async () => {
    const downService = makeMockService({
        checkDocumentAccess() {
            throw new Error('Fabric network is unavailable: connect ECONNREFUSED');
        },
    });
    const middleware = createRequireFabricRecordAccess({ records: RECORDS, service: downService });
    await withServer(buildRecordApp(DOCTOR, middleware), async (base) => {
        const res = await fetch(`${base}/api/medical-records/rec_1`);
        assert.equal(res.status, 503);
    });
});

test('record access: missing record → 404', async () => {
    const middleware = createRequireFabricRecordAccess({ records: RECORDS, service: makeMockService() });
    await withServer(buildRecordApp(PATIENT, middleware), async (base) => {
        const res = await fetch(`${base}/api/medical-records/nope`);
        assert.equal(res.status, 404);
    });
});

// ─── /api/fabric routes ───────────────────────────────────────────────────────
test('POST /api/fabric/access/grant records a permission (patient only)', async () => {
    setFabricServiceForTests(makeMockService());
    await withServer(buildFabricApp(PATIENT), async (base) => {
        const res = await fetch(`${base}/api/fabric/access/grant`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId: 'rec_1', doctorWallet: DOCTOR, durationDays: 7 }),
        });
        assert.equal(res.status, 201);
        const body = await res.json();
        assert.equal(body.doctorId, DOCTOR);
        assert.equal(body.status, 'ACTIVE');
    });
});

test('POST /api/fabric/access/revoke revokes a permission', async () => {
    setFabricServiceForTests(makeMockService());
    await withServer(buildFabricApp(PATIENT), async (base) => {
        const res = await fetch(`${base}/api/fabric/access/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId: 'rec_1', doctorWallet: DOCTOR }),
        });
        assert.equal(res.status, 200);
        assert.equal((await res.json()).status, 'REVOKED');
    });
});

test('GET /api/fabric/access?documentId= returns permission list', async () => {
    setFabricServiceForTests(makeMockService());
    await withServer(buildFabricApp(PATIENT), async (base) => {
        const res = await fetch(`${base}/api/fabric/access?documentId=rec_1`);
        assert.equal(res.status, 200);
        const list = await res.json();
        assert.ok(Array.isArray(list));
        assert.equal(list[0].doctorId, DOCTOR);
    });
});

test('GET /api/fabric/doctor/documents returns authorized docs', async () => {
    setFabricServiceForTests(makeMockService());
    await withServer(buildFabricApp(DOCTOR), async (base) => {
        const res = await fetch(`${base}/api/fabric/doctor/documents`);
        assert.equal(res.status, 200);
        const docs = await res.json();
        assert.ok(Array.isArray(docs));
        assert.equal(docs[0].documentId, 'rec_1');
    });
});

test('GET /api/fabric/audit/:documentId returns audit events', async () => {
    setFabricServiceForTests(makeMockService());
    await withServer(buildFabricApp(PATIENT), async (base) => {
        const res = await fetch(`${base}/api/fabric/audit/rec_1`);
        assert.equal(res.status, 200);
        const events = await res.json();
        assert.ok(Array.isArray(events));
        assert.equal(events[0].action, 'DOCUMENT_CREATED');
    });
});

test('POST /api/fabric/claims creates a claim (patient)', async () => {
    setFabricServiceForTests(makeMockService());
    await withServer(buildFabricApp(PATIENT), async (base) => {
        const res = await fetch(`${base}/api/fabric/claims`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claimId: 'claim_1', documentId: 'rec_1', insuranceProviderId: INSURANCE, amount: '5000', currency: 'INR' }),
        });
        assert.equal(res.status, 201);
        assert.equal((await res.json()).status, 'SUBMITTED');
    });
});

test('POST /api/fabric/claims/:id/status updates status (provider)', async () => {
    setFabricServiceForTests(makeMockService());
    await withServer(buildFabricApp(INSURANCE), async (base) => {
        const res = await fetch(`${base}/api/fabric/claims/claim_1/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'UNDER_REVIEW' }),
        });
        assert.equal(res.status, 200);
        assert.equal((await res.json()).status, 'UNDER_REVIEW');
    });
});

test('unauthenticated fabric request → 401', async () => {
    setFabricServiceForTests(makeMockService());
    const app = express();
    app.use(express.json());
    app.use('/api/fabric', fabricRoutes); // no auth middleware → no req.auth
    await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/fabric/doctor/documents`);
        assert.equal(res.status, 401);
    });
});
