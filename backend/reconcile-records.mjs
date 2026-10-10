// reconcile-records.mjs
//
// Diagnostic script: compares the locally stored records (connections.json)
// against what the Fabric ledger actually knows about, per patient.
//
// Usage (run from your backend/ folder, next to connections.json):
//   node reconcile-records.mjs
//
// It does NOT modify anything — it only reports. Read the output, then
// decide whether to delete the orphaned local entries or re-register them
// on-chain.

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

// IMPORTANT: must load .env BEFORE importing anything that initializes the
// Fabric gateway — getFabricService() reads FABRIC_PEER_TLS_CERT_PATH and
// friends from process.env at call time, same as server.js does.
dotenv.config({ path: join(__dirname, ".env") });

const { getFabricService } = await import("./middleware/fabricRecordAccess.js");

const DB = join(__dirname, "connections.json");

async function main() {
    const db = JSON.parse(readFileSync(DB, "utf8"));
    const records = db.records || [];

    if (records.length === 0) {
        console.log("No local records found — nothing to check.");
        return;
    }

    console.log(`Checking ${records.length} local record(s) against Fabric...\n`);

    const fabricService = await getFabricService();

    // Group local records by patientWallet so we only query Fabric once per patient.
    const byPatient = new Map();
    for (const record of records) {
        const wallet = (record.patientWallet || "").toLowerCase();
        if (!byPatient.has(wallet)) byPatient.set(wallet, []);
        byPatient.get(wallet).push(record);
    }

    const orphaned = [];
    const healthy = [];

    for (const [patientWallet, patientRecords] of byPatient) {
        let fabricRecords = [];
        try {
            // Query as the patient themself so we see everything they own.
            fabricRecords = await fabricService.getPatientRecords(patientWallet, patientWallet);
        } catch (error) {
            console.error(`  ! Failed to query Fabric for ${patientWallet}: ${error.message}`);
            continue;
        }

        const fabricIds = new Set((fabricRecords || []).map(r => r.documentId));

        for (const record of patientRecords) {
            if (fabricIds.has(record.id)) {
                healthy.push(record);
            } else {
                orphaned.push(record);
            }
        }
    }

    console.log(`✓ ${healthy.length} record(s) confirmed on-chain.`);
    console.log(`✗ ${orphaned.length} record(s) exist locally but NOT on Fabric:\n`);

    for (const record of orphaned) {
        console.log(`  - ${record.id}`);
        console.log(`      patient:  ${record.patientWallet}`);
        console.log(`      file:     ${record.original?.name}`);
        console.log(`      created:  ${record.createdAt}`);
        console.log(`      cid:      ${record.cid}\n`);
    }

    if (orphaned.length > 0) {
        console.log(
            "These are the records causing 'Record ... not found' errors when\n" +
            "granting/checking access. They exist in connections.json but the\n" +
            "chaincode has never heard of them. You have two options:\n" +
            "  1. Delete them from connections.json's records[] array (data is\n" +
            "     still safe on IPFS if you have the CID — just the local index\n" +
            "     entry and Fabric metadata are out of sync).\n" +
            "  2. Re-run fabricService.createMedicalRecord(...) for each one to\n" +
            "     register them on-chain now, if the underlying file is still\n" +
            "     valid and you want it to become grantable.\n"
        );
    }
}

main().catch(err => {
    console.error("Reconciliation failed:", err);
    process.exit(1);
});
