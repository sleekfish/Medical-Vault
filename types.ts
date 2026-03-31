export enum UserRole {
  PATIENT = 'PATIENT',
  DOCTOR = 'DOCTOR',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  isVerified?: boolean; // For doctors
  abdmId?: string; // India specific health ID
}

export interface MedicalRecord {
  id: string;
  name: string;
  type: 'PDF' | 'IMAGE' | 'LAB_REPORT' | 'PRESCRIPTION';
  date: string;
  size: string;
  hash: string; // Keccak-256
  encryptionType: 'ChaCha20-Poly1305';
  ipfsCid: string; // Arweave/IPFS reference
  notarized: boolean; // Polygon status
  sharedWith: string[]; // Doctor IDs
  fileUrl?: string; // Local blob URL for previewing uploaded files
    category: string;
}

export interface VitalStats {
  heartRate: number;
  bloodPressure: string;
  spO2: number;
  temperature: number;
  lastUpdated: string;
}

export interface DoctorProfile {
  id: string;
  name: string;
  specialty: string;
  licenseNumber: string; // Medical Council License
  hospitalAffiliation: string;
  verified: boolean;
  rating: number;
}

export class BreakGlassRequest {
}

export class VitalsReading {
    timestamp:any ;
}

export class HealthAlert {
    read: unknown;
    id: React.Key;
    type: string;
    timestamp: any;
    message: any;
}

export class AccessLog {
    action: "GRANTED" | "REVOKED" | "ACCESSED";
    doctorName: any;
    timestamp: any;
    recordsAccessed: any;
    txHash: any;
}

export class Appointment {
}

export class Doctor {
    name: any;
    specialization: any;
    available: any;
    hospital: any;
    rating: number;
    id: string;
}

export class PrescriptionQR {
}

export class SymptomCheckResult {
}