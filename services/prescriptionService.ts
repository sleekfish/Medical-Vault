import {
    clearWalletAccessToken,
    getWalletAccessToken,
} from "./walletAuthService";

const BACKEND_URL =
    (import.meta.env.VITE_BACKEND_URL ||
        "http://localhost:5000") as string;


async function prescriptionFetch<T>(
    url: string,
    options: RequestInit,
    wallet: string
): Promise<T> {

    const request =
        async (
            accessToken: string
        ) =>
            fetch(
                url,
                {
                    ...options,

                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${accessToken}`,

                        ...(options.headers || {})
                    }
                }
            );


    let response =
        await request(
            await getWalletAccessToken(
                wallet
            )
        );


    if (
        response.status === 401
    ) {

        clearWalletAccessToken(
            wallet
        );

        response =
            await request(
                await getWalletAccessToken(
                    wallet,
                    true
                )
            );
    }


    const body =
        await response
            .json()
            .catch(
                () => ({})
            );


    if (!response.ok) {

        throw new Error(
            body.error ||
            `Prescription API error ${response.status}`
        );
    }


    return body as T;
}


// ============================================================
// TYPES
// ============================================================

export interface PrescriptionMedicine {

    name: string;

    dosage: string;

    frequency?: string;

    duration?: string;

    instructions?: string;
}


// Matches the shape returned by routes/fabric/prescriptions.js
export interface FabricPrescription {

    prescriptionId: string;

    patientId: string;

    doctorId: string;

    appointmentId?: string;

    diagnosis: string;

    medicines: PrescriptionMedicine[];

    instructions: string;

    followUpDate: string;

    status: string;

    issuedAt: string;

    updatedAt?: string;

    createdBy?: string;
}


// ============================================================
// CREATE
// POST /api/fabric/prescriptions
// (doctor wallet auth'd via bearer token — server reads req.auth)
// ============================================================

export async function createPrescription(
    doctorWallet: string,
    data: {
        patientWallet: string;

        appointmentId?: string;

        diagnosis: string;

        medicines: PrescriptionMedicine[];

        instructions?: string;

        followUpDate?: string;
    }
): Promise<FabricPrescription> {

    return prescriptionFetch<FabricPrescription>(
        `${BACKEND_URL}/api/fabric/prescriptions`,
        {
            method: "POST",

            body: JSON.stringify(
                data
            )
        },
        doctorWallet
    );
}


// ============================================================
// PATIENT LIST
// GET /api/fabric/prescriptions
// (patient identity comes from the bearer token, not a query param)
// ============================================================

export async function getPatientPrescriptions(
    patientWallet: string
): Promise<FabricPrescription[]> {

    return prescriptionFetch<
        FabricPrescription[]
    >(
        `${BACKEND_URL}/api/fabric/prescriptions`,
        {
            method: "GET"
        },
        patientWallet
    );
}


// ============================================================
// SINGLE PRESCRIPTION
// GET /api/fabric/prescriptions/:prescriptionId
// ============================================================

export async function getPrescription(
    prescriptionId: string,
    requesterWallet: string
): Promise<FabricPrescription> {

    return prescriptionFetch<FabricPrescription>(
        `${BACKEND_URL}/api/fabric/prescriptions/` +
        encodeURIComponent(
            prescriptionId
        ),
        {
            method: "GET"
        },
        requesterWallet
    );
}


// ============================================================
// DOCTOR PRESCRIPTIONS
// GET /api/fabric/doctor/prescriptions
// ============================================================

export async function getDoctorPrescriptions(
    doctorWallet: string
): Promise<FabricPrescription[]> {

    return prescriptionFetch<
        FabricPrescription[]
    >(
        `${BACKEND_URL}/api/fabric/doctor/prescriptions`,
        {
            method: "GET"
        },
        doctorWallet
    );
}


// ============================================================
// REVOKE
// POST /api/fabric/prescriptions/:prescriptionId/revoke
// ============================================================

export async function revokePrescription(
    doctorWallet: string,
    prescriptionId: string
): Promise<FabricPrescription> {

    return prescriptionFetch<FabricPrescription>(
        `${BACKEND_URL}/api/fabric/prescriptions/` +
        encodeURIComponent(
            prescriptionId
        ) +
        "/revoke",
        {
            method: "POST"
        },
        doctorWallet
    );
}