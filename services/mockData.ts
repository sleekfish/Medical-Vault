import { MedicalRecord, VitalsReading, HealthAlert, AccessLog, Appointment } from '../types';

export const MOCK_RECORDS: MedicalRecord[] = [
    {
        id: 'rec_001',
        name: 'Complete Blood Count Report',
        type: 'PDF',
        date: '2025-12-10',
        hash: 'abc123def456',
        ipfsCid: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
        notarized: true,
        sharedWith: ['doc_001'],
        fileUrl: 'https://ipfs.io/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
        expiryDate: '2026-12-10',
        category: 'Lab Report',
        encryptionType: 'ChaCha20-Poly1305',
    },
    {
        id: 'rec_002',
        name: 'Chest X-Ray - PA View',
        type: 'IMAGE',
        date: '2025-11-28',
        hash: 'xyz789ghi012',
        ipfsCid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
        notarized: true,
        sharedWith: [],
        fileUrl: 'https://ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
        expiryDate: '2027-11-28',
        category: 'Radiology',
        encryptionType: 'ChaCha20-Poly1305',
    },
    {
        id: 'rec_003',
        name: 'Lipid Profile Test',
        type: 'PDF',
        date: '2025-10-15',
        hash: 'lmn345opq678',
        ipfsCid: 'QmT78bkBpAFxkCHEp8SJaViCZRXxJmhC6UxwqkTrgVXmDp',
        notarized: true,
        sharedWith: ['doc_001', 'doc_002'],
        fileUrl: 'https://ipfs.io/ipfs/QmT78bkBpAFxkCHEp8SJaViCZRXxJmhC6UxwqkTrgVXmDp',
        expiryDate: '2026-04-15',
        category: 'Lab Report',
        encryptionType: 'AES-GCM' as const,
    },
    {
        id: 'rec_004',
        name: 'COVID-19 Vaccination Certificate',
        type: 'PDF',
        date: '2024-03-01',
        hash: 'vax001cert999',
        ipfsCid: 'QmVaccine123BoosterCertificateIPFSHash456789',
        notarized: true,
        sharedWith: [],
        fileUrl: '',
        expiryDate: '2025-03-01',
        category: 'Vaccination',
        encryptionType: 'ChaCha20-Poly1305',
    },
    {
        id: 'rec_005',
        name: 'Echocardiogram Report',
        type: 'PDF',
        date: '2025-09-20',
        hash: 'echo567heart890',
        ipfsCid: 'QmEcho567HeartReportIPFSHashABCDEF123456',
        notarized: true,
        sharedWith: ['doc_001'],
        fileUrl: '',
        expiryDate: '2028-09-20',
        category: 'Cardiology',
        encryptionType: 'ChaCha20-Poly1305',
    },
];

export const MOCK_STATS = {
    heartRate: '72 BPM',
    bloodPressure: '120/80 mmHg',
    spO2: '99%',
    weight: '74 kg',
    glucose: '92 mg/dL',
    temperature: '98.6°F',
};

export const MOCK_VITALS_HISTORY: VitalsReading[] = Array.from({ length: 90 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (89 - i));
    return {
        timestamp: date.toISOString(),
        heartRate: 68 + Math.round(Math.sin(i * 0.2) * 6 + Math.random() * 5),
        spo2: 97 + Math.round(Math.random() * 2),
        systolic: 118 + Math.round(Math.sin(i * 0.1) * 8 + Math.random() * 4),
        diastolic: 78 + Math.round(Math.sin(i * 0.1) * 4 + Math.random() * 3),
        weight: 74 + parseFloat((Math.sin(i * 0.05) * 0.8).toFixed(1)),
        glucose: 88 + Math.round(Math.sin(i * 0.15) * 10 + Math.random() * 6),
    };
});

export const MOCK_ACCESS_LOGS: AccessLog[] = [
    {
        doctorId: 'doc_001',
        doctorName: 'Dr. Sunita Mehta',
        action: 'GRANTED',
        timestamp: '2025-12-10T10:30:00Z',
        txHash: '0xabc123...def456',
    },
    {
        doctorId: 'doc_001',
        doctorName: 'Dr. Sunita Mehta',
        action: 'ACCESSED',
        timestamp: '2025-12-11T09:15:00Z',
        txHash: '0x789abc...456def',
        recordsAccessed: ['Complete Blood Count Report', 'Lipid Profile Test'],
    },
    {
        doctorId: 'doc_002',
        doctorName: 'Dr. Arjun Sharma',
        action: 'GRANTED',
        timestamp: '2025-11-20T14:00:00Z',
        txHash: '0xfed321...cba654',
    },
    {
        doctorId: 'doc_002',
        doctorName: 'Dr. Arjun Sharma',
        action: 'REVOKED',
        timestamp: '2025-12-01T16:45:00Z',
        txHash: '0x111222...333444',
    },
];

export const MOCK_APPOINTMENTS: Appointment[] = [
    {
        id: 'apt_001',
        patientWallet: '0x051...c3f0',
        doctorId: 'doc_001',
        doctorName: 'Dr. Sunita Mehta',
        specialization: 'Cardiologist',
        date: '2026-03-20',
        time: '11:00 AM',
        status: 'CONFIRMED',
        type: 'IN_PERSON',
        notes: 'Follow-up for echocardiogram',
    },
    {
        id: 'apt_002',
        patientWallet: '0x051...c3f0',
        doctorId: 'doc_003',
        doctorName: 'Dr. Priya Nair',
        specialization: 'General Physician',
        date: '2026-03-18',
        time: '3:30 PM',
        status: 'PENDING',
        type: 'TELEMEDICINE',
        notes: 'Routine checkup',
    },
];

export const MOCK_HEALTH_ALERTS: HealthAlert[] = [
    {
        id: 'alert_001',
        type: 'WARNING',
        message: 'COVID-19 Vaccination Certificate expired on 2025-03-01. Please renew.',
        timestamp: '2025-03-02T08:00:00Z',
        read: false,
    },
    {
        id: 'alert_002',
        type: 'INFO',
        message: 'Lipid Profile Test expires in 30 days (2026-04-15). Consider renewing.',
        timestamp: '2026-03-15T08:00:00Z',
        read: false,
    },
    {
        id: 'alert_003',
        type: 'INFO',
        message: 'Dr. Sunita Mehta accessed your vault on Dec 11.',
        timestamp: '2025-12-11T09:15:00Z',
        read: true,
    },
];