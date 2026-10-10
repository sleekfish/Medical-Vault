import {
    AccessLog,
    Appointment,
    Doctor,
    HealthAlert,
    MedicalRecord,
    VitalsReading,
} from '../types';

export const DOCTORS: Doctor[] = [
    { id:'doc_001', name:'Dr. Sunita Mehta',   specialization:'Cardiologist',       hospital:'Apollo Hospitals, Mumbai',     rating:4.9, available:true,  walletAddress:'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', licenseNo:'MCI-2023-8821' },
    { id:'doc_002', name:'Dr. Arjun Sharma',   specialization:'Neurologist',         hospital:'Kokilaben Hospital, Mumbai',   rating:4.7, available:true,  walletAddress:'0x70997970C51812dc3A010C7d01b50e0d17dc79C8', licenseNo:'MCI-2021-5543' },
    { id:'doc_003', name:'Dr. Priya Nair',     specialization:'General Physician',   hospital:'Fortis Hospital, Mulund',      rating:4.8, available:true,  walletAddress:'0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', licenseNo:'MCI-2022-3310' },
    { id:'doc_004', name:'Dr. Rahul Verma',    specialization:'Diabetologist',       hospital:'Breach Candy Hospital',        rating:4.6, available:false, walletAddress:'0x90F79bf6EB2c4f870365E785982E1f101E93b906', licenseNo:'MCI-2020-1189' },
    { id:'doc_005', name:'Dr. Ananya Bose',    specialization:'Pulmonologist',       hospital:'Hinduja Hospital, Mahim',      rating:4.5, available:true,  walletAddress:'0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', licenseNo:'MCI-2019-7742' },
    { id:'doc_006', name:'Dr. Vikram Desai',   specialization:'Orthopedic Surgeon',  hospital:'Lilavati Hospital, BKC',       rating:4.8, available:true,  walletAddress:'0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', licenseNo:'MCI-2018-9981' },
];

export const MOCK_RECORDS: MedicalRecord[] = [
    {
        id: 'rec_demo_bloodwork', name: 'Annual Bloodwork.pdf', type: 'PDF', date: '2026-06-12',
        hash: '5f8c7a2de4b6910397bc4a110bd6e79fc97aec34d9a628cab83a40f2781d25e6',
        ipfsCid: 'Qm5f8c7a2de4b6910397bc4a110bd6e79fc97aec34d9a', notarized: true,
        sharedWith: ['Dr. Sunita Mehta'], encryptionType: 'AES-GCM', category: 'Laboratory', expiryDate: '2027-06-12',
    },
    {
        id: 'rec_demo_prescription', name: 'Cardiology Prescription.pdf', type: 'PDF', date: '2026-05-04',
        hash: '1c6e8f0da5b2c718e4d9a67f302b5cd824f1e76a9d0bc46587af9123d4e5f6a7',
        ipfsCid: 'Qm1c6e8f0da5b2c718e4d9a67f302b5cd824f1e76a9d0bc', notarized: true,
        sharedWith: [], encryptionType: 'AES-GCM', category: 'Prescription', expiryDate: '2026-08-20',
    },
    {
        id: 'rec_demo_scan', name: 'Chest X-ray.png', type: 'IMAGE', date: '2026-03-28',
        hash: 'bc42d3e9f0516a7c84b2d5e8031f6a9d7c2b4e81f0a6d3c5b7e92f4180d6a3b5',
        ipfsCid: 'Qmbc42d3e9f0516a7c84b2d5e8031f6a9d7c2b4e81f0a6d3', notarized: true,
        sharedWith: ['Dr. Arjun Sharma'], encryptionType: 'AES-GCM', category: 'Imaging', expiryDate: '2026-07-31',
    },
];

export const MOCK_APPOINTMENTS: Appointment[] = [
    {
        id: 'apt_demo_1', patientWallet: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', doctorId: 'doc_001',
        doctorName: 'Dr. Sunita Mehta', specialization: 'Cardiologist', date: '12 Aug 2026',
        time: '10:30 AM', status: 'CONFIRMED', type: 'IN_PERSON',
    },
];

export const MOCK_HEALTH_ALERTS: HealthAlert[] = [
    { id: 'alert_demo_1', type: 'INFO', message: 'Your annual bloodwork is available in the vault.', timestamp: '2026-06-12T09:30:00.000Z', read: true },
    { id: 'alert_demo_2', type: 'WARNING', message: 'Your cardiology prescription expires soon.', timestamp: '2026-07-30T09:30:00.000Z', read: false },
];

export const MOCK_ACCESS_LOGS: AccessLog[] = [
    {
        doctorId: 'doc_001', doctorName: 'Dr. Sunita Mehta', action: 'GRANTED', timestamp: '2026-06-12T09:30:00.000Z',
        recordsAccessed: ['Annual Bloodwork.pdf'], txHash: '0x3d77e4a8f7c6b1d4e9905d8f8b0a5d3c7e1f6b9a2d4c8f0e1a5b7c9d3e6f8a0b',
    },
    {
        doctorId: 'doc_002', doctorName: 'Dr. Arjun Sharma', action: 'ACCESSED', timestamp: '2026-06-18T11:15:00.000Z',
        recordsAccessed: ['Chest X-ray.png'], txHash: '0x7e1a5c9d3f8b2e4a6c0d1f5b7e9a2c4d6f8b0e1a3c5d7f9b2e4a6c8d0f1b3e5a',
    },
];

export const MOCK_VITALS_HISTORY: VitalsReading[] = Array.from({ length: 90 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (89 - index));
    return {
        timestamp: date.toISOString(),
        heartRate: 72 + Math.round(Math.sin(index * 0.28) * 5),
        spo2: 98 + (index % 7 === 0 ? 1 : 0),
        systolic: 120 + Math.round(Math.sin(index * 0.17) * 6),
        diastolic: 80 + Math.round(Math.cos(index * 0.2) * 3),
        glucose: 96 + Math.round(Math.sin(index * 0.13) * 8),
        weight: Number((74.2 + Math.sin(index * 0.08) * 0.7).toFixed(1)),
    };
});
