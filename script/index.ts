export enum UserRole {
    PATIENT = 'PATIENT',
    DOCTOR  = 'DOCTOR',
}

export interface User {
    id:         string;
    email:      string;
    name:       string;
    role:       UserRole;
    isVerified: boolean;
}

export interface MedicalRecord {
    id:              string;
    name:            string;
    type:            string;
    date:            string;
    size?:           string;
    hash:            string;
    encryptionType?: 'ChaCha20-Poly1305' | 'AES-GCM';   // ← fixed: was string literal union in mockData
    ipfsCid:         string;
    notarized:       boolean;
    sharedWith:      string[];
    fileUrl?:        string;
    expiryDate?:     string;      // ← was missing
    category?:       string;      // ← was missing
}

export interface Doctor {
    id:              string;
    name:            string;
    specialization:  string;
    hospital?:       string;      // ← was missing
    rating?:         number;      // ← was missing
    available?:      boolean;     // ← was missing
    walletAddress?:  string;      // ← was missing
    licenseNo?:      string;      // ← was missing
}

export interface AccessLog {
    doctorId:          string;
    doctorName:        string;
    action:            'GRANTED' | 'REVOKED' | 'ACCESSED';
    timestamp:         string;
    txHash?:           string;
    recordsAccessed?:  string[];
}

export interface Appointment {
    id:             string;
    patientWallet:  string;
    doctorId:       string;
    doctorName:     string;
    specialization: string;
    date:           string;
    time?:          string;
    status:         'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
    type:           'IN_PERSON' | 'TELEMEDICINE';
    notes?:         string;
}

export interface VitalsReading {
    timestamp:  string;
    heartRate:  number;
    spo2:       number;
    systolic:   number;
    diastolic:  number;
    weight?:    number;
    glucose?:   number;
}

export interface HealthAlert {
    id:        string;
    type:      'WARNING' | 'INFO' | 'CRITICAL';
    message:   string;
    timestamp: string;
    read:      boolean;
}

export interface SymptomCheckResult {
    triageSeverity:     'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
    possibleConditions: string[];
    recommendation:     string;
    relatedRecords:     string[];
    disclaimer:         string;
}

export interface PrescriptionQR {
    id:            string;
    patientWallet: string;
    doctorId:      string;
    doctorName:    string;
    medication:    string;
    dosage:        string;
    duration:      string;
    issuedDate:    string;
    expiryDate:    string;
    txHash:        string;
    verified:      boolean;
}

export interface BreakGlassRequest {
    id:            string;
    doctorId:      string;
    doctorName:    string;
    reason:        string;
    requestedAt:   string;
    expiresAt:     string;
    approved:      boolean;
    patientWallet: string;
}