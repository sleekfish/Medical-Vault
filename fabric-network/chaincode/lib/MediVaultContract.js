'use strict';

const { Contract } = require('fabric-contract-api');

/**
 * MediVault Hyperledger Fabric Chaincode
 *
 * Manages:
 *   - Medical records
 *   - Document-level access control
 *   - Patient/doctor consent
 *   - Prescriptions
 *   - Insurance claims
 *   - Audit trail
 *
 * Storage model:
 *   - Actual encrypted medical files are stored on IPFS/Pinata.
 *   - Fabric stores CID, SHA-256 hash and trusted metadata.
 *
 * Identity model:
 *   - patientId and doctorId are application-level identities.
 *   - Ownership and access decisions are enforced by chaincode.
 *
 * Important:
 *   Fabric transaction timestamps are deterministic across endorsing
 *   peers. Therefore all timestamps written to the ledger use
 *   _getTxTimestamp(ctx).
 *
 *   The unit-test mock used by this project may not implement
 *   ctx.stub.getTxTimestamp(). In that case _getTxTimestamp()
 *   falls back to the local clock only for tests.
 */
class MediVaultContract extends Contract {

    constructor() {
        super('MediVaultContract');
    }

    // ========================================================================
    // TIMESTAMP HELPERS
    // ========================================================================

    _getTxTimestamp(ctx) {
        if (
            ctx &&
            ctx.stub &&
            typeof ctx.stub.getTxTimestamp === 'function'
        ) {
            const timestamp = ctx.stub.getTxTimestamp();

            let seconds;

            if (
                timestamp &&
                timestamp.seconds !== undefined &&
                timestamp.seconds !== null
            ) {
                if (typeof timestamp.seconds === 'object') {
                    seconds = Number(timestamp.seconds.toString());
                } else {
                    seconds = Number(timestamp.seconds);
                }
            } else {
                seconds = 0;
            }

            const nanos = Number(
                timestamp && timestamp.nanos
                    ? timestamp.nanos
                    : 0
            );

            return new Date(
                seconds * 1000 +
                Math.floor(nanos / 1000000)
            ).toISOString();
        }

        return new Date().toISOString();
    }

    _getTxDate(ctx) {
        return new Date(this._getTxTimestamp(ctx));
    }

    _getExpiryTimestamp(ctx, durationDays) {
        const days = Number(durationDays);

        if (!Number.isFinite(days) || days <= 0) {
            return null;
        }

        const date = this._getTxDate(ctx);
        date.setUTCDate(date.getUTCDate() + days);

        return date.toISOString();
    }

    // ========================================================================
    // MEDICAL RECORDS
    // ========================================================================

    async CreateMedicalRecord(
        ctx,
        documentId,
        patientId,
        cid,
        sha256Hash,
        documentType,
        fileName
    ) {
        if (!documentId || !patientId || !cid || !sha256Hash) {
            throw new Error(
                'documentId, patientId, cid, and sha256Hash are required'
            );
        }

        const existing = await this._getRecord(ctx, documentId);

        if (existing) {
            throw new Error(
                `Record ${documentId} already exists`
            );
        }

        const timestamp = this._getTxTimestamp(ctx);

        const record = {
            docType: 'medicalRecord',
            documentId,
            patientId,
            cid,
            sha256Hash,
            documentType:
                documentType || 'MEDICAL_DOCUMENT',
            fileName:
                fileName || 'medical-record',
            owner: patientId,
            createdAt: timestamp,
            updatedAt: timestamp,
            registeredBy: this._getCallerMSP(ctx)
        };

        await ctx.stub.putState(
            documentId,
            Buffer.from(JSON.stringify(record))
        );

        const patientRecordKey =
            ctx.stub.createCompositeKey(
                'patientRecord',
                [patientId, documentId]
            );

        await ctx.stub.putState(
            patientRecordKey,
            Buffer.from(documentId)
        );

        await this._recordAudit(
            ctx,
            documentId,
            patientId,
            '',
            'DOCUMENT_CREATED',
            'Medical record metadata registered'
        );

        return JSON.stringify(record);
    }

    async GetMedicalRecord(
        ctx,
        documentId,
        requesterId
    ) {
        if (!requesterId) {
            throw new Error('requesterId is required');
        }

        const record =
            await this._getRecord(ctx, documentId);

        if (!record) {
            throw new Error(
                `Record ${documentId} not found`
            );
        }

        const isOwner =
            requesterId === record.patientId;

        if (!isOwner) {
            const hasAccess =
                await this._checkDocumentPermission(
                    ctx,
                    documentId,
                    requesterId
                );

            if (!hasAccess) {
                await this._recordAudit(
                    ctx,
                    documentId,
                    record.patientId,
                    requesterId,
                    'DOCUMENT_ACCESS_DENIED',
                    'Record read attempt without permission'
                );

                throw new Error(
                    'Unauthorized: you do not have access to this record'
                );
            }
        }

        return JSON.stringify(record);
    }

    async VerifyMedicalRecord(
        ctx,
        documentId,
        providedHash
    ) {
        const record =
            await this._getRecord(ctx, documentId);

        if (!record) {
            throw new Error(
                `Record ${documentId} not found`
            );
        }

        const match =
            record.sha256Hash === providedHash;

        return JSON.stringify({
            documentId,
            verified: match,
            storedHash: record.sha256Hash
        });
    }

    async GetPatientRecords(
        ctx,
        patientId,
        requesterId
    ) {
        if (!patientId || !requesterId) {
            throw new Error(
                'patientId and requesterId are required'
            );
        }

        const isOwner =
            requesterId === patientId;

        const iterator =
            await ctx.stub.getStateByPartialCompositeKey(
                'patientRecord',
                [patientId]
            );

        const records = [];

        while (true) {
            const result = await iterator.next();

            if (result.value) {
                const docId =
                    result.value.value.toString();

                const record =
                    await this._getRecord(
                        ctx,
                        docId
                    );

                if (!record) {
                    continue;
                }

                if (isOwner) {
                    records.push(record);
                } else {
                    const hasAccess =
                        await this._checkDocumentPermission(
                            ctx,
                            docId,
                            requesterId
                        );

                    if (hasAccess) {
                        records.push(record);
                    }
                }
            }

            if (result.done) {
                break;
            }
        }

        return JSON.stringify(records);
    }

    // ========================================================================
    // DOCUMENT ACCESS CONTROL
    // ========================================================================

    async GrantDocumentAccess(
        ctx,
        documentId,
        patientId,
        doctorId,
        permission,
        durationDays
    ) {
        if (
            !documentId ||
            !patientId ||
            !doctorId
        ) {
            throw new Error(
                'documentId, patientId, and doctorId are required'
            );
        }

        const record =
            await this._getRecord(
                ctx,
                documentId
            );

        if (!record) {
            throw new Error(
                `Record ${documentId} not found`
            );
        }

        if (patientId !== record.patientId) {
            throw new Error(
                'Unauthorized: only the document owner can grant access'
            );
        }

        if (permission !== 'VIEW') {
            throw new Error(
                'Only VIEW permission is supported'
            );
        }

        const days =
            parseInt(durationDays, 10);

        if (isNaN(days) || days < 0) {
            throw new Error(
                'durationDays must be 0 (permanent) or a positive integer'
            );
        }

        const existingPermKey =
            ctx.stub.createCompositeKey(
                'docPerm',
                [documentId, doctorId]
            );

        const existingPermIdBytes =
            await ctx.stub.getState(
                existingPermKey
            );

        if (
            existingPermIdBytes &&
            existingPermIdBytes.length > 0
        ) {
            const existingId =
                existingPermIdBytes.toString();

            const existingBytes =
                await ctx.stub.getState(
                    existingId
                );

            if (
                existingBytes &&
                existingBytes.length > 0
            ) {
                const existing =
                    JSON.parse(
                        existingBytes.toString()
                    );

                existing.status = 'REVOKED';

                existing.revokedAt =
                    this._getTxTimestamp(ctx);

                existing.revokedBy =
                    patientId;

                await ctx.stub.putState(
                    existingId,
                    Buffer.from(
                        JSON.stringify(existing)
                    )
                );
            }
        }

        const permissionId =
            `perm_${documentId}_${doctorId}_${ctx.stub.getTxID()}`;

        const grantedAt =
            this._getTxTimestamp(ctx);

        const expiresAt =
            days > 0
                ? this._getExpiryTimestamp(ctx, days)
                : null;

        const permissionRecord = {
            docType: 'documentPermission',
            permissionId,
            documentId,
            patientId: record.patientId,
            doctorId,
            permission,
            grantedAt,
            expiresAt,
            status: 'ACTIVE',
            grantedBy: patientId
        };

        await ctx.stub.putState(
            permissionId,
            Buffer.from(
                JSON.stringify(permissionRecord)
            )
        );

        const permKey =
            ctx.stub.createCompositeKey(
                'docPerm',
                [documentId, doctorId]
            );

        await ctx.stub.putState(
            permKey,
            Buffer.from(permissionId)
        );

        const doctorPermKey =
            ctx.stub.createCompositeKey(
                'doctorPerm',
                [doctorId, documentId]
            );

        await ctx.stub.putState(
            doctorPermKey,
            Buffer.from(permissionId)
        );

        await this._recordAudit(
            ctx,
            documentId,
            record.patientId,
            doctorId,
            'DOCUMENT_ACCESS_GRANTED',
            `VIEW access granted for ${
                days === 0
                    ? 'permanent'
                    : days + ' days'
            }`
        );

        return JSON.stringify(
            permissionRecord
        );
    }

    async RevokeDocumentAccess(
        ctx,
        documentId,
        patientId,
        doctorId
    ) {
        if (
            !documentId ||
            !patientId ||
            !doctorId
        ) {
            throw new Error(
                'documentId, patientId, and doctorId are required'
            );
        }

        const record =
            await this._getRecord(
                ctx,
                documentId
            );

        if (!record) {
            throw new Error(
                `Record ${documentId} not found`
            );
        }

        if (patientId !== record.patientId) {
            throw new Error(
                'Unauthorized: only the document owner can revoke access'
            );
        }

        const permKey =
            ctx.stub.createCompositeKey(
                'docPerm',
                [documentId, doctorId]
            );

        const permIdBytes =
            await ctx.stub.getState(
                permKey
            );

        if (
            !permIdBytes ||
            permIdBytes.length === 0
        ) {
            throw new Error(
                `No active permission found for doctor ${doctorId} on document ${documentId}`
            );
        }

        const permId =
            permIdBytes.toString();

        const permBytes =
            await ctx.stub.getState(
                permId
            );

        if (
            !permBytes ||
            permBytes.length === 0
        ) {
            throw new Error(
                'Permission record not found'
            );
        }

        const perm =
            JSON.parse(
                permBytes.toString()
            );

        perm.status = 'REVOKED';

        perm.revokedAt =
            this._getTxTimestamp(ctx);

        perm.revokedBy =
            patientId;

        await ctx.stub.putState(
            permId,
            Buffer.from(
                JSON.stringify(perm)
            )
        );

        await this._recordAudit(
            ctx,
            documentId,
            record.patientId,
            doctorId,
            'DOCUMENT_ACCESS_REVOKED',
            'Access revoked by owner'
        );

        return JSON.stringify(perm);
    }

    async CheckDocumentAccess(
        ctx,
        documentId,
        doctorId,
        requesterId
    ) {
        if (
            !documentId ||
            !doctorId ||
            !requesterId
        ) {
            throw new Error(
                'documentId, doctorId, and requesterId are required'
            );
        }

        const record =
            await this._getRecord(
                ctx,
                documentId
            );

        if (!record) {
            throw new Error(
                `Record ${documentId} not found`
            );
        }

        if (
            requesterId !== doctorId &&
            requesterId !== record.patientId
        ) {
            throw new Error(
                'Unauthorized: you cannot check access for this document'
            );
        }

        const hasAccess =
            await this._checkDocumentPermission(
                ctx,
                documentId,
                doctorId
            );

        if (!hasAccess) {
            await this._recordAudit(
                ctx,
                documentId,
                record.patientId,
                doctorId,
                'DOCUMENT_ACCESS_DENIED',
                'Authorization check failed'
            );

            throw new Error(
                'Unauthorized: you do not have access to this document'
            );
        }

        return JSON.stringify({
            authorized: true,
            documentId,
            doctorId
        });
    }

    async GetDocumentAccessList(
        ctx,
        documentId,
        patientId
    ) {
        if (!documentId || !patientId) {
            throw new Error(
                'documentId and patientId are required'
            );
        }

        const record =
            await this._getRecord(
                ctx,
                documentId
            );

        if (!record) {
            throw new Error(
                `Record ${documentId} not found`
            );
        }

        if (patientId !== record.patientId) {
            throw new Error(
                'Unauthorized: only the document owner can view the access list'
            );
        }

        const permissions = [];

        const iterator =
            await ctx.stub.getStateByPartialCompositeKey(
                'docPerm',
                [documentId]
            );

        while (true) {
            const result =
                await iterator.next();

            if (result.value) {
                const permId =
                    result.value.value.toString();

                const permBytes =
                    await ctx.stub.getState(
                        permId
                    );

                if (
                    permBytes &&
                    permBytes.length > 0
                ) {
                    const perm =
                        JSON.parse(
                            permBytes.toString()
                        );

                    if (
                        perm.expiresAt &&
                        new Date(
                            perm.expiresAt
                        ) < this._getTxDate(ctx)
                    ) {
                        perm.status = 'EXPIRED';
                    }

                    permissions.push(perm);
                }
            }

            if (result.done) {
                break;
            }
        }

        permissions.sort(
            (a, b) =>
                new Date(b.grantedAt) -
                new Date(a.grantedAt)
        );

        return JSON.stringify(
            permissions
        );
    }

    async GetDoctorAuthorizedDocuments(
        ctx,
        doctorId,
        requesterId
    ) {
        if (!doctorId || !requesterId) {
            throw new Error(
                'doctorId and requesterId are required'
            );
        }

        if (requesterId !== doctorId) {
            throw new Error(
                'Unauthorized: only the doctor can view their authorized documents'
            );
        }

        const documents = [];

        const iterator =
            await ctx.stub.getStateByPartialCompositeKey(
                'doctorPerm',
                [doctorId]
            );

        while (true) {
            const result =
                await iterator.next();

            if (result.value) {
                const compositeKey =
                    result.value.key;

                const parts =
                    ctx.stub.splitCompositeKey(
                        compositeKey
                    );

                const documentId =
                    parts.attributes[1];

                const permId =
                    result.value.value.toString();

                const permBytes =
                    await ctx.stub.getState(
                        permId
                    );

                if (
                    permBytes &&
                    permBytes.length > 0
                ) {
                    const perm =
                        JSON.parse(
                            permBytes.toString()
                        );

                    if (
                        perm.expiresAt &&
                        new Date(
                            perm.expiresAt
                        ) < this._getTxDate(ctx)
                    ) {
                        continue;
                    }

                    if (perm.status !== 'ACTIVE') {
                        continue;
                    }

                    const record =
                        await this._getRecord(
                            ctx,
                            documentId
                        );

                    if (record) {
                        documents.push({
                            documentId,
                            patientId:
                            record.patientId,
                            fileName:
                            record.fileName,
                            documentType:
                            record.documentType,
                            permission:
                            perm.permission,
                            grantedAt:
                            perm.grantedAt,
                            expiresAt:
                            perm.expiresAt
                        });
                    }
                }
            }

            if (result.done) {
                break;
            }
        }

        documents.sort(
            (a, b) =>
                new Date(b.grantedAt) -
                new Date(a.grantedAt)
        );

        return JSON.stringify(
            documents
        );
    }

    // ========================================================================
    // CONSENT
    // ========================================================================

    async GrantConsent(
        ctx,
        patientId,
        doctorId,
        scope,
        durationDays
    ) {
        if (!patientId || !doctorId) {
            throw new Error(
                'patientId and doctorId are required'
            );
        }

        const days =
            parseInt(durationDays, 10);

        if (isNaN(days) || days < 0) {
            throw new Error(
                'durationDays must be 0 (permanent) or a positive integer'
            );
        }

        const consentId =
            `consent_${patientId}_${doctorId}_${ctx.stub.getTxID()}`;

        const grantedAt =
            this._getTxTimestamp(ctx);

        const expiresAt =
            days > 0
                ? this._getExpiryTimestamp(
                    ctx,
                    days
                )
                : null;

        const consent = {
            docType: 'consent',
            consentId,
            patientId,
            doctorId,
            scope:
                scope || 'ALL_RECORDS',
            grantedAt,
            expiresAt,
            status: 'ACTIVE'
        };

        await ctx.stub.putState(
            consentId,
            Buffer.from(
                JSON.stringify(consent)
            )
        );

        const consentKey =
            ctx.stub.createCompositeKey(
                'patientConsent',
                [patientId, doctorId]
            );

        await ctx.stub.putState(
            consentKey,
            Buffer.from(consentId)
        );

        return JSON.stringify(
            consent
        );
    }

    async RevokeConsent(
        ctx,
        patientId,
        doctorId
    ) {
        if (!patientId || !doctorId) {
            throw new Error(
                'patientId and doctorId are required'
            );
        }

        const consentKey =
            ctx.stub.createCompositeKey(
                'patientConsent',
                [patientId, doctorId]
            );

        const consentIdBytes =
            await ctx.stub.getState(
                consentKey
            );

        if (
            !consentIdBytes ||
            consentIdBytes.length === 0
        ) {
            throw new Error(
                `No consent found between patient ${patientId} and doctor ${doctorId}`
            );
        }

        const consentId =
            consentIdBytes.toString();

        const consentBytes =
            await ctx.stub.getState(
                consentId
            );

        if (
            !consentBytes ||
            consentBytes.length === 0
        ) {
            throw new Error(
                'Consent record not found'
            );
        }

        const consent =
            JSON.parse(
                consentBytes.toString()
            );

        consent.status = 'REVOKED';

        consent.revokedAt =
            this._getTxTimestamp(ctx);

        await ctx.stub.putState(
            consentId,
            Buffer.from(
                JSON.stringify(consent)
            )
        );

        return JSON.stringify(
            consent
        );
    }

    async GetConsent(
        ctx,
        patientId,
        doctorId
    ) {
        const consentKey =
            ctx.stub.createCompositeKey(
                'patientConsent',
                [patientId, doctorId]
            );

        const consentIdBytes =
            await ctx.stub.getState(
                consentKey
            );

        if (
            !consentIdBytes ||
            consentIdBytes.length === 0
        ) {
            return JSON.stringify({
                status: 'NONE'
            });
        }

        const consentId =
            consentIdBytes.toString();

        const consentBytes =
            await ctx.stub.getState(
                consentId
            );

        if (
            !consentBytes ||
            consentBytes.length === 0
        ) {
            return JSON.stringify({
                status: 'NONE'
            });
        }

        const consent =
            JSON.parse(
                consentBytes.toString()
            );

        if (
            consent.expiresAt &&
            new Date(
                consent.expiresAt
            ) < this._getTxDate(ctx)
        ) {
            consent.status = 'EXPIRED';
        }

        return JSON.stringify(
            consent
        );
    }

    // ========================================================================
    // PRESCRIPTIONS
    // ========================================================================

    /**
     * CreatePrescription
     *
     * Doctor authors a prescription for a patient.
     *
     * medicinesJson is a JSON-stringified array, e.g.:
     *   [{ "name": "Atorvastatin 10mg", "dosage": "1 tablet daily", "duration": "30 days" }]
     *
     * A prescription is visible to the patient as soon as it is created —
     * there is no separate "share" step, matching how a real prescription
     * works.
     */
    async CreatePrescription(
        ctx,
        prescriptionId,
        patientId,
        doctorId,
        appointmentId,
        diagnosis,
        medicinesJson,
        instructions,
        followUpDate
    ) {
        if (
            !prescriptionId ||
            !patientId ||
            !doctorId ||
            !diagnosis ||
            !medicinesJson
        ) {
            throw new Error(
                'prescriptionId, patientId, doctorId, diagnosis, and medicinesJson are required'
            );
        }

        const existing =
            await this._getPrescription(ctx, prescriptionId);

        if (existing) {
            throw new Error(
                `Prescription ${prescriptionId} already exists`
            );
        }

        let medicines;

        try {
            medicines = JSON.parse(medicinesJson);
        } catch {
            throw new Error(
                'medicinesJson must be valid JSON'
            );
        }

        if (!Array.isArray(medicines) || medicines.length === 0) {
            throw new Error(
                'medicinesJson must be a non-empty array'
            );
        }

        const timestamp = this._getTxTimestamp(ctx);

        const prescription = {
            docType: 'prescription',
            prescriptionId,
            patientId,
            doctorId,
            appointmentId: appointmentId || '',
            diagnosis,
            medicines,
            instructions: instructions || '',
            followUpDate: followUpDate || '',
            status: 'ACTIVE',
            issuedAt: timestamp,
            updatedAt: timestamp
        };

        await ctx.stub.putState(
            prescriptionId,
            Buffer.from(JSON.stringify(prescription))
        );

        const patientKey =
            ctx.stub.createCompositeKey(
                'patientPrescription',
                [patientId, prescriptionId]
            );

        await ctx.stub.putState(
            patientKey,
            Buffer.from(prescriptionId)
        );

        const doctorKey =
            ctx.stub.createCompositeKey(
                'doctorPrescription',
                [doctorId, prescriptionId]
            );

        await ctx.stub.putState(
            doctorKey,
            Buffer.from(prescriptionId)
        );

        await this._recordAudit(
            ctx,
            prescriptionId,
            patientId,
            doctorId,
            'PRESCRIPTION_CREATED',
            `Prescription issued by ${doctorId}`
        );

        return JSON.stringify(prescription);
    }

    /**
     * GetPrescription
     *
     * Only the patient (owner) or the issuing doctor may read it.
     */
    async GetPrescription(
        ctx,
        prescriptionId,
        requesterId
    ) {
        if (!requesterId) {
            throw new Error('requesterId is required');
        }

        const prescription =
            await this._getPrescription(ctx, prescriptionId);

        if (!prescription) {
            throw new Error(
                `Prescription ${prescriptionId} not found`
            );
        }

        const isOwner = requesterId === prescription.patientId;
        const isAuthor = requesterId === prescription.doctorId;

        if (!isOwner && !isAuthor) {
            throw new Error(
                'Unauthorized: you do not have access to this prescription'
            );
        }

        return JSON.stringify(prescription);
    }

    /**
     * GetPatientPrescriptions
     *
     * Only the patient themselves can list their full prescription history.
     */
    async GetPatientPrescriptions(
        ctx,
        patientId,
        requesterId
    ) {
        if (!patientId || !requesterId) {
            throw new Error(
                'patientId and requesterId are required'
            );
        }

        if (requesterId !== patientId) {
            throw new Error(
                'Unauthorized: only the patient can view their full prescription list'
            );
        }

        const prescriptions = [];

        const iterator =
            await ctx.stub.getStateByPartialCompositeKey(
                'patientPrescription',
                [patientId]
            );

        while (true) {
            const result = await iterator.next();

            if (result.value) {
                const prescriptionId =
                    result.value.value.toString();

                const prescription =
                    await this._getPrescription(ctx, prescriptionId);

                if (prescription) {
                    prescriptions.push(prescription);
                }
            }

            if (result.done) {
                break;
            }
        }

        prescriptions.sort(
            (a, b) =>
                new Date(b.issuedAt) - new Date(a.issuedAt)
        );

        return JSON.stringify(prescriptions);
    }

    /**
     * GetDoctorPrescriptions
     *
     * Doctor can only view prescriptions they themselves authored.
     */
    async GetDoctorPrescriptions(
        ctx,
        doctorId,
        requesterId
    ) {
        if (!doctorId || !requesterId) {
            throw new Error(
                'doctorId and requesterId are required'
            );
        }

        if (requesterId !== doctorId) {
            throw new Error(
                'Unauthorized: only the doctor can view their issued prescriptions'
            );
        }

        const prescriptions = [];

        const iterator =
            await ctx.stub.getStateByPartialCompositeKey(
                'doctorPrescription',
                [doctorId]
            );

        while (true) {
            const result = await iterator.next();

            if (result.value) {
                const prescriptionId =
                    result.value.value.toString();

                const prescription =
                    await this._getPrescription(ctx, prescriptionId);

                if (prescription) {
                    prescriptions.push(prescription);
                }
            }

            if (result.done) {
                break;
            }
        }

        prescriptions.sort(
            (a, b) =>
                new Date(b.issuedAt) - new Date(a.issuedAt)
        );

        return JSON.stringify(prescriptions);
    }

    /**
     * RevokePrescription
     *
     * Only the issuing doctor can revoke (e.g. entered in error).
     */
    async RevokePrescription(
        ctx,
        prescriptionId,
        doctorId
    ) {
        if (!prescriptionId || !doctorId) {
            throw new Error(
                'prescriptionId and doctorId are required'
            );
        }

        const prescription =
            await this._getPrescription(ctx, prescriptionId);

        if (!prescription) {
            throw new Error(
                `Prescription ${prescriptionId} not found`
            );
        }

        if (prescription.doctorId !== doctorId) {
            throw new Error(
                'Unauthorized: only the issuing doctor can revoke this prescription'
            );
        }

        prescription.status = 'REVOKED';
        prescription.updatedAt = this._getTxTimestamp(ctx);

        await ctx.stub.putState(
            prescriptionId,
            Buffer.from(JSON.stringify(prescription))
        );

        await this._recordAudit(
            ctx,
            prescriptionId,
            prescription.patientId,
            doctorId,
            'PRESCRIPTION_REVOKED',
            'Prescription revoked by issuing doctor'
        );

        return JSON.stringify(prescription);
    }

    // ========================================================================
    // INSURANCE CLAIMS
    // ========================================================================

    async CreateClaim(
        ctx,
        claimId,
        patientId,
        documentId,
        insuranceProviderId,
        amount,
        currency
    ) {
        if (
            !claimId ||
            !patientId ||
            !documentId ||
            !insuranceProviderId ||
            !amount
        ) {
            throw new Error(
                'claimId, patientId, documentId, insuranceProviderId, and amount are required'
            );
        }

        const record =
            await this._getRecord(
                ctx,
                documentId
            );

        if (!record) {
            throw new Error(
                `Record ${documentId} not found`
            );
        }

        if (patientId !== record.patientId) {
            throw new Error(
                'Unauthorized: only the patient can create a claim for their own record'
            );
        }

        const existing =
            await this._getClaim(
                ctx,
                claimId
            );

        if (existing) {
            throw new Error(
                `Claim ${claimId} already exists`
            );
        }

        const timestamp =
            this._getTxTimestamp(ctx);

        const claim = {
            docType: 'insuranceClaim',
            claimId,
            patientId,
            documentId,
            insuranceProviderId,
            amount: parseFloat(amount),
            currency:
                currency || 'INR',
            status: 'SUBMITTED',
            createdAt: timestamp,
            updatedAt: timestamp
        };

        await ctx.stub.putState(
            claimId,
            Buffer.from(
                JSON.stringify(claim)
            )
        );

        const patientClaimKey =
            ctx.stub.createCompositeKey(
                'patientClaim',
                [patientId, claimId]
            );

        await ctx.stub.putState(
            patientClaimKey,
            Buffer.from(claimId)
        );

        await this._recordAudit(
            ctx,
            documentId,
            patientId,
            insuranceProviderId,
            'CLAIM_SUBMITTED',
            `Claim ${claimId} submitted`
        );

        return JSON.stringify(
            claim
        );
    }

    async UpdateClaimStatus(
        ctx,
        claimId,
        newStatus,
        actingProviderId
    ) {
        const claim =
            await this._getClaim(
                ctx,
                claimId
            );

        if (!claim) {
            throw new Error(
                `Claim ${claimId} not found`
            );
        }

        const validStatuses = [
            'SUBMITTED',
            'UNDER_REVIEW',
            'APPROVED',
            'DENIED',
            'PAID'
        ];

        if (
            !validStatuses.includes(
                newStatus
            )
        ) {
            throw new Error(
                `Invalid status: ${newStatus}. Valid: ${validStatuses.join(', ')}`
            );
        }

        if (
            !actingProviderId ||
            actingProviderId !==
            claim.insuranceProviderId
        ) {
            throw new Error(
                'Unauthorized: only the insurance provider can update claim status'
            );
        }

        claim.status = newStatus;

        claim.updatedAt =
            this._getTxTimestamp(ctx);

        await ctx.stub.putState(
            claimId,
            Buffer.from(
                JSON.stringify(claim)
            )
        );

        await this._recordAudit(
            ctx,
            claim.documentId,
            claim.patientId,
            actingProviderId,
            'CLAIM_STATUS_UPDATED',
            `Claim ${claimId} → ${newStatus}`
        );

        return JSON.stringify(
            claim
        );
    }

    async GetClaim(
        ctx,
        claimId
    ) {
        const claim =
            await this._getClaim(
                ctx,
                claimId
            );

        if (!claim) {
            throw new Error(
                `Claim ${claimId} not found`
            );
        }

        return JSON.stringify(
            claim
        );
    }

    async GetPatientClaims(
        ctx,
        patientId,
        requesterId
    ) {
        if (!patientId || !requesterId) {
            throw new Error(
                'patientId and requesterId are required'
            );
        }

        const claims = [];

        const iterator =
            await ctx.stub.getStateByPartialCompositeKey(
                'patientClaim',
                [patientId]
            );

        while (true) {
            const result =
                await iterator.next();

            if (result.value) {
                const claimId =
                    result.value.value.toString();

                const claim =
                    await this._getClaim(
                        ctx,
                        claimId
                    );

                if (claim) {
                    if (
                        requesterId === patientId ||
                        requesterId ===
                        claim.insuranceProviderId
                    ) {
                        claims.push(claim);
                    }
                }
            }

            if (result.done) {
                break;
            }
        }

        return JSON.stringify(
            claims
        );
    }

    // ========================================================================
    // AUDIT TRAIL
    // ========================================================================

    async RecordAuditEvent(
        ctx,
        documentId,
        patientId,
        doctorId,
        action,
        details
    ) {
        const event =
            await this._recordAudit(
                ctx,
                documentId,
                patientId,
                doctorId,
                action,
                details
            );

        return JSON.stringify(
            event
        );
    }

    async GetAuditHistory(
        ctx,
        documentId,
        patientId
    ) {
        if (!documentId || !patientId) {
            throw new Error(
                'documentId and patientId are required'
            );
        }

        const record =
            await this._getRecord(
                ctx,
                documentId
            );

        if (!record) {
            throw new Error(
                `Record ${documentId} not found`
            );
        }

        if (patientId !== record.patientId) {
            throw new Error(
                'Unauthorized: only the document owner can view audit history'
            );
        }

        const events = [];

        const iterator =
            await ctx.stub.getStateByPartialCompositeKey(
                'docAudit',
                [documentId]
            );

        while (true) {
            const result =
                await iterator.next();

            if (result.value) {
                const eventId =
                    result.value.value.toString();

                const eventBytes =
                    await ctx.stub.getState(
                        eventId
                    );

                if (
                    eventBytes &&
                    eventBytes.length > 0
                ) {
                    events.push(
                        JSON.parse(
                            eventBytes.toString()
                        )
                    );
                }
            }

            if (result.done) {
                break;
            }
        }

        events.sort(
            (a, b) =>
                new Date(b.timestamp) -
                new Date(a.timestamp)
        );

        return JSON.stringify(
            events
        );
    }

    // ========================================================================
    // INTERNAL HELPERS
    // ========================================================================

    _getCallerMSP(ctx) {
        try {
            return ctx.clientIdentity.getMSPID();
        } catch {
            return 'UNKNOWN';
        }
    }

    async _getRecord(
        ctx,
        documentId
    ) {
        const bytes =
            await ctx.stub.getState(
                documentId
            );

        if (
            !bytes ||
            bytes.length === 0
        ) {
            return null;
        }

        const record =
            JSON.parse(
                bytes.toString()
            );

        return record.docType ===
        'medicalRecord'
            ? record
            : null;
    }

    /**
     * Retrieve a prescription.
     */
    async _getPrescription(
        ctx,
        prescriptionId
    ) {
        const bytes =
            await ctx.stub.getState(
                prescriptionId
            );

        if (
            !bytes ||
            bytes.length === 0
        ) {
            return null;
        }

        const prescription =
            JSON.parse(
                bytes.toString()
            );

        return prescription.docType === 'prescription'
            ? prescription
            : null;
    }

    async _getClaim(
        ctx,
        claimId
    ) {
        const bytes =
            await ctx.stub.getState(
                claimId
            );

        if (
            !bytes ||
            bytes.length === 0
        ) {
            return null;
        }

        const claim =
            JSON.parse(
                bytes.toString()
            );

        return claim.docType ===
        'insuranceClaim'
            ? claim
            : null;
    }

    async _checkDocumentPermission(
        ctx,
        documentId,
        doctorId
    ) {
        const permKey =
            ctx.stub.createCompositeKey(
                'docPerm',
                [documentId, doctorId]
            );

        const permIdBytes =
            await ctx.stub.getState(
                permKey
            );

        if (
            !permIdBytes ||
            permIdBytes.length === 0
        ) {
            return false;
        }

        const permId =
            permIdBytes.toString();

        const permBytes =
            await ctx.stub.getState(
                permId
            );

        if (
            !permBytes ||
            permBytes.length === 0
        ) {
            return false;
        }

        const perm =
            JSON.parse(
                permBytes.toString()
            );

        if (
            perm.status !== 'ACTIVE'
        ) {
            return false;
        }

        if (
            perm.expiresAt &&
            new Date(
                perm.expiresAt
            ) < this._getTxDate(ctx)
        ) {
            return false;
        }

        return true;
    }

    async _recordAudit(
        ctx,
        documentId,
        patientId,
        doctorId,
        action,
        details
    ) {
        const txId =
            ctx.stub.getTxID();

        const timestamp =
            this._getTxTimestamp(ctx);

        const eventId =
            `audit_${timestamp}_${txId}`;

        const event = {
            docType: 'auditEvent',
            eventId,
            documentId,
            patientId,
            doctorId,
            action,
            details,
            timestamp,
            transactionId: txId
        };

        await ctx.stub.putState(
            eventId,
            Buffer.from(
                JSON.stringify(event)
            )
        );

        const docAuditKey =
            ctx.stub.createCompositeKey(
                'docAudit',
                [documentId, eventId]
            );

        await ctx.stub.putState(
            docAuditKey,
            Buffer.from(eventId)
        );

        return event;
    }
}

module.exports = MediVaultContract;