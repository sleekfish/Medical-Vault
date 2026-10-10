/**
 * MediVault Fabric Access Service
 *
 * Frontend API layer for document-level access control, audit, and insurance
 * claims — backed by the MediVault chaincode via the Fabric Gateway.
 *
 * Every call authenticates with the wallet session (MetaMask).
 */

import { clearWalletAccessToken, getWalletAccessToken } from "./walletAuthService";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:5000") as string;

interface FabricPermission {
    permissionId: string;
    documentId: string;
    patientId: string;
    doctorId: string;
    permission: string;
    grantedAt: string;
    expiresAt: string | null;
    status: string;
    grantedBy: string;
}

interface FabricAuditEvent {
    eventId: string;
    documentId: string;
    patientId: string;
    doctorId: string;
    action: string;
    details: string;
    timestamp: string;
    transactionId: string;
}

interface FabricDoctorDoc {
    documentId: string;
    patientId: string;
    fileName: string;
    documentType: string;
    permission: string;
    grantedAt: string;
    expiresAt: string | null;
}

// ─── Internal fetch wrapper with wallet-session auth ──────────────────────────

async function fabricFetch<T>(url: string, options: RequestInit, wallet: string): Promise<T> {
    const withAuth = async (accessToken: string) => fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers || {}),
        },
    });

    let response = await withAuth(await getWalletAccessToken(wallet));
    if (response.status === 401) {
        clearWalletAccessToken(wallet);
        response = await withAuth(await getWalletAccessToken(wallet, true));
    }
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Fabric API error ${response.status}`);
    }
    return response.json() as Promise<T>;
}

// ─── Document-level access control ────────────────────────────────────────────

/**
 * Patient grants a doctor VIEW access to one specific document.
 * @param durationDays - '1' | '7' | '30' | '0' (permanent)
 */
export async function grantDocumentAccess(
    patientWallet: string,
    documentId: string,
    doctorWallet: string,
    permission = "VIEW",
    durationDays: string | number = 7,
): Promise<FabricPermission> {
    return fabricFetch<FabricPermission>(
        `${BACKEND_URL}/api/fabric/access/grant`,
        {
            method: "POST",
            body: JSON.stringify({
                documentId,
                doctorWallet,
                permission,
                durationDays,
            }),
        },
        patientWallet,
    );
}

/**
 * Patient revokes a doctor's access to a specific document.
 */
export async function revokeDocumentAccess(
    patientWallet: string,
    documentId: string,
    doctorWallet: string,
): Promise<FabricPermission> {
    return fabricFetch<FabricPermission>(
        `${BACKEND_URL}/api/fabric/access/revoke`,
        {
            method: "POST",
            body: JSON.stringify({ documentId, doctorWallet }),
        },
        patientWallet,
    );
}

/**
 * Owner retrieves the full list of permissions for a document.
 */
export async function getDocumentAccessList(
    patientWallet: string,
    documentId: string,
): Promise<FabricPermission[]> {
    const url = `${BACKEND_URL}/api/fabric/access?documentId=${encodeURIComponent(documentId)}`;
    return fabricFetch<FabricPermission[]>(url, { method: "GET" }, patientWallet);
}

// ─── Doctor authorized documents ──────────────────────────────────────────────

/**
 * Doctor retrieves the list of documents they have active permission for.
 * Returns an empty array when the chaincode returns no results.
 */
export async function getDoctorAuthorizedDocuments(
    doctorWallet: string,
): Promise<FabricDoctorDoc[]> {
    return fabricFetch<FabricDoctorDoc[]>(
        `${BACKEND_URL}/api/fabric/doctor/documents`,
        { method: "GET" },
        doctorWallet,
    );
}

// ─── Audit trail ──────────────────────────────────────────────────────────────

/**
 * Owner retrieves the audit history for a specific document.
 */
export async function getAuditHistory(
    patientWallet: string,
    documentId: string,
): Promise<FabricAuditEvent[]> {
    const url = `${BACKEND_URL}/api/fabric/audit/${encodeURIComponent(documentId)}`;
    return fabricFetch<FabricAuditEvent[]>(url, { method: "GET" }, patientWallet);
}

// ─── Insurance claims ─────────────────────────────────────────────────────────

interface FabricClaim {
    claimId: string;
    patientId: string;
    documentId: string;
    insuranceProviderId: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Patient creates an insurance claim linked to one of their documents.
 */
export async function createClaim(
    patientWallet: string,
    data: { documentId: string; insuranceProviderId: string; amount: string; currency?: string },
): Promise<FabricClaim> {
    const claimId = `claim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return fabricFetch<FabricClaim>(
        `${BACKEND_URL}/api/fabric/claims`,
        {
            method: "POST",
            body: JSON.stringify({ claimId, ...data }),
        },
        patientWallet,
    );
}

/**
 * Patient lists their claims (the chaincode also lets their provider list them).
 */
export async function getPatientClaims(patientWallet: string): Promise<FabricClaim[]> {
    return fabricFetch<FabricClaim[]>(
        `${BACKEND_URL}/api/fabric/claims`,
        { method: "GET" },
        patientWallet,
    );
}

export type { FabricPermission, FabricDoctorDoc, FabricAuditEvent, FabricClaim };
