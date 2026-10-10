/**
 * MediVault Fabric Service
 *
 * High-level service wrapper around the MediVault
 * Hyperledger Fabric chaincode.
 */

import { getFabricGateway } from "./gateway.js";


function fabricError(message) {
    const error = new Error(message);
    error.code = "FABRIC_CHAINCODE_ERROR";
    return error;
}


function parseResult(raw) {

    if (
        typeof raw !== "string"
    ) {
        return raw;
    }

    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}


export class MediVaultFabricService {

    // ============================================================
    // INTERNAL FABRIC HELPERS
    // ============================================================

    async _submit(
        name,
        ...args
    ) {

        const gateway =
            await getFabricGateway();

        try {

            return parseResult(
                await gateway.submitTransaction(
                    name,
                    ...args
                )
            );

        } catch (error) {

            console.error(
                `[Fabric] Transaction failed: ${name}`,
                error
            );

            throw fabricError(
                error?.message ||
                `Fabric transaction ${name} failed`
            );
        }
    }


    async _evaluate(
        name,
        ...args
    ) {

        const gateway =
            await getFabricGateway();

        try {

            return parseResult(
                await gateway.evaluateTransaction(
                    name,
                    ...args
                )
            );

        } catch (error) {

            console.error(
                `[Fabric] Query failed: ${name}`,
                error
            );

            throw fabricError(
                error?.message ||
                `Fabric query ${name} failed`
            );
        }
    }


    // ============================================================
    // MEDICAL RECORDS
    // ============================================================

    createMedicalRecord(data) {

        return this._submit(
            "CreateMedicalRecord",

            data.documentId,

            data.patientId,

            data.cid,

            data.sha256Hash,

            data.documentType ||
            "MEDICAL_DOCUMENT",

            data.fileName ||
            "medical-record"
        );
    }


    getMedicalRecord(
        documentId,
        requesterId
    ) {

        return this._evaluate(
            "GetMedicalRecord",
            documentId,
            requesterId
        );
    }


    verifyMedicalRecord(
        documentId,
        providedHash
    ) {

        return this._evaluate(
            "VerifyMedicalRecord",
            documentId,
            providedHash
        );
    }


    getPatientRecords(
        patientId,
        requesterId
    ) {

        return this._evaluate(
            "GetPatientRecords",
            patientId,
            requesterId
        );
    }


    // ============================================================
    // PRESCRIPTIONS
    // ============================================================

    /**
     * Create a prescription on Fabric.
     */
    createPrescription(data) {

        return this._submit(
            "CreatePrescription",

            data.prescriptionId,

            data.patientId,

            data.doctorId,

            data.appointmentId ||
            "",

            data.diagnosis,

            JSON.stringify(
                data.medicines || []
            ),

            data.instructions ||
            "",

            data.followUpDate ||
            ""
        );
    }


    /**
     * Get one prescription.
     */
    getPrescription(
        prescriptionId,
        requesterId
    ) {

        return this._evaluate(
            "GetPrescription",
            prescriptionId,
            requesterId
        );
    }


    /**
     * Get all prescriptions for a patient.
     */
    getPatientPrescriptions(
        patientId,
        requesterId
    ) {

        return this._evaluate(
            "GetPatientPrescriptions",
            patientId,
            requesterId
        );
    }


    /**
     * Get prescriptions created by a doctor.
     */
    getDoctorPrescriptions(
        doctorId,
        requesterId
    ) {

        return this._evaluate(
            "GetDoctorPrescriptions",
            doctorId,
            requesterId
        );
    }


    /**
     * Revoke prescription.
     */
    revokePrescription(
        prescriptionId,
        doctorId
    ) {

        return this._submit(
            "RevokePrescription",
            prescriptionId,
            doctorId
        );
    }


    // ============================================================
    // DOCUMENT ACCESS
    // ============================================================

    grantDocumentAccess(data) {

        return this._submit(
            "GrantDocumentAccess",

            data.documentId,

            data.patientId,

            data.doctorId,

            data.permission ||
            "VIEW",

            String(
                data.durationDays ?? 7
            )
        );
    }


    revokeDocumentAccess(
        documentId,
        patientId,
        doctorId
    ) {

        return this._submit(
            "RevokeDocumentAccess",

            documentId,

            patientId,

            doctorId
        );
    }


    checkDocumentAccess(
        documentId,
        doctorId,
        requesterId
    ) {

        return this._evaluate(
            "CheckDocumentAccess",

            documentId,

            doctorId,

            requesterId
        );
    }


    getDocumentAccessList(
        documentId,
        patientId
    ) {

        return this._evaluate(
            "GetDocumentAccessList",

            documentId,

            patientId
        );
    }


    getDoctorAuthorizedDocuments(
        doctorId,
        requesterId
    ) {

        return this._evaluate(
            "GetDoctorAuthorizedDocuments",

            doctorId,

            requesterId
        );
    }


    // ============================================================
    // CONSENT
    // ============================================================

    grantConsent(
        patientId,
        doctorId,
        scope,
        durationDays
    ) {

        return this._submit(
            "GrantConsent",

            patientId,

            doctorId,

            scope ||
            "ALL_RECORDS",

            String(
                durationDays ?? 0
            )
        );
    }


    revokeConsent(
        patientId,
        doctorId
    ) {

        return this._submit(
            "RevokeConsent",

            patientId,

            doctorId
        );
    }


    getConsent(
        patientId,
        doctorId
    ) {

        return this._evaluate(
            "GetConsent",

            patientId,

            doctorId
        );
    }


    // ============================================================
    // INSURANCE
    // ============================================================

    createClaim(data) {

        return this._submit(
            "CreateClaim",

            data.claimId,

            data.patientId,

            data.documentId,

            data.insuranceProviderId,

            String(data.amount),

            data.currency ||
            "INR"
        );
    }


    updateClaimStatus(
        claimId,
        newStatus,
        providerId
    ) {

        return this._submit(
            "UpdateClaimStatus",

            claimId,

            newStatus,

            providerId
        );
    }


    getClaim(
        claimId
    ) {

        return this._evaluate(
            "GetClaim",
            claimId
        );
    }


    getPatientClaims(
        patientId,
        requesterId
    ) {

        return this._evaluate(
            "GetPatientClaims",

            patientId,

            requesterId
        );
    }


    // ============================================================
    // AUDIT
    // ============================================================

    recordAuditEvent(data) {

        return this._submit(
            "RecordAuditEvent",

            data.documentId,

            data.patientId ||
            "",

            data.doctorId ||
            "",

            data.action,

            data.details ||
            ""
        );
    }


    getAuditHistory(
        documentId,
        patientId
    ) {

        return this._evaluate(
            "GetAuditHistory",

            documentId,

            patientId
        );
    }
}


export default MediVaultFabricService;