# MediVault → Hyperledger Fabric Migration

This document explains how the MediVault major project was migrated from the
Ethereum/Hardhat demo stack to a permissioned **Hyperledger Fabric** network,
and how to run the new stack.

## Why Fabric

The old demo stubbed blockchain behaviour (fake `0x…` transaction hashes,
consent-based access). The target architecture uses Fabric because it provides:

1. **Permissioned identities** — only registered orgs/peers (healthcare,
   insurance) participate; no mining or gas.
2. **Channel-based isolation** — a `medivault` channel shared by the two orgs.
3. **Document-level access control** — access is granted per *document* with an
   explicit **expiry**, enforced *inside the chaincode* on every read.
4. **Immutable audit trail** — every grant, revoke, denied attempt, and view is
   recorded as an audit event on the ledger.

## Architecture

```
 MetaMask wallet  ──►  React frontend
                        │  VITE_BACKEND_URL
                        ▼
                Express backend (server.js)
                        │  @hyperledger/fabric-gateway  (Admin@healthcare cert)
                        ▼
                Fabric Gateway Service (backend/services/fabric/)
                        │
                        ▼
        ┌──────── medivault channel ────────┐
        │  peer0.healthcare  ·  peer0.insurance │
        │  chaincode: medivault (Node.js)        │
        └───────────────────────────────────────┘
```

The **backend holds the single Fabric identity** (the healthcare admin cert)
and relays the authenticated wallet address into chaincode transactions. The
chaincode treats the wallet address as the domain identity:

| Field | Meaning |
|---|---|
| `patientId` | patient's MetaMask wallet address (lowercase) |
| `doctorId`  | doctor's MetaMask wallet address (lowercase) |
| `cid`       | IPFS CID of the **encrypted** file |
| `sha256Hash`| SHA-256 of the ciphertext (integrity) |
| `documentPermission` | one (document, doctor) pair, `VIEW`, `expiresAt` |

## What changed

### New: `fabric-network/`
| Path | Purpose |
|---|---|
| `crypto-config.yaml` | 2 orgs (HealthcareMSP, InsuranceMSP), orderer, users |
| `configtx.yaml` | channel `medivault`, consortium `MediVaultConsortium` |
| `docker-compose.yml` | orderer, 2 peers, CLI container |
| `scripts/network.sh` | `generate` / `up` / `createChannel` / `deployChaincode` / `cleanup` |
| `chaincode/` | Node.js chaincode + 15 passing unit tests |
| `chaincode/lib/MediVaultContract.js` | all ledger logic |
| `chaincode/tests/` | offline unit tests (mock stub) |

### New: backend
| Path | Purpose |
|---|---|
| `backend/services/fabric/gateway.js` | gRPC Fabric Gateway connection |
| `backend/services/fabric/index.js` | `MediVaultFabricService` (chaincode wrapper) |
| `backend/middleware/fabricRecordAccess.js` | document-level access middleware |
| `backend/routes/fabricRoutes.js` | `/api/fabric/*` routes |

### Changed: backend
- `POST /api/medical-records` → registers metadata on-chain after pinning.
- `GET /api/medical-records?patientWallet=` → doctors only see documents the
  chaincode says they may see (no connection-based shortcut).
- `GET /api/medical-records/:id/download` → `CheckDocumentAccess` for
  non-owners, records `DOCUMENT_VIEWED` audit event.
- `GET /api/medical-records/:id` → same Fabric check.

### New: frontend
| Path | Purpose |
|---|---|
| `services/fabricAccessService.ts` | API layer for permissions, audit, doctor docs |
| `components/ManageAccessPanel.tsx` | Patient: grant/revoke VIEW per document + expiry |
| `components/DoctorAuthorizedDocuments.tsx` | Doctor: only chaincode-authorized documents |
| `components/FabricAuditPanel.tsx` | Patient: on-chain audit trail per document |

Patient dashboard → **Access** tab and **Audit** tab are now live Fabric views.
Doctor dashboard → **My authorized medical documents** panel above the patient list.

## How to run

### 1. Start the Fabric network
Requires **Docker Desktop** + **Git Bash** (Windows). From `fabric-network/`:

```bash
./scripts/network.sh full
```

This generates identities, starts containers, creates the channel, and deploys
the `medivault` chaincode. On failure, see the README in `fabric-network/`.

### 2. Install backend deps (includes Fabric SDK)
```bash
cd backend
npm install
cp .env.example .env   # fill PINATA_JWT, ENCRYPTION_KEY_BASE64, FABRIC_* paths
npm start              # or: node server.js
```

### 3. Frontend
```bash
npm install
npm run dev
```

Connect a **patient** MetaMask account → upload a document → **Access** tab →
pick the document + doctor + expiry → *Grant Access*. Then switch MetaMask to
that **doctor** account → the document appears under *My authorized medical
documents* and in the patient's record list.

## Chaincode transaction summary

| Function | Type | Enforces |
|---|---|---|
| `CreateMedicalRecord` | write | no duplicate documentId |
| `GetMedicalRecord` | read | owner **or** active permission |
| `VerifyMedicalRecord` | read | hash match (public) |
| `GetPatientRecords` | read | per-document filtering for doctors |
| `GrantDocumentAccess` | write | owner only; revokes prior permission |
| `RevokeDocumentAccess` | write | owner only |
| `CheckDocumentAccess` | read | doctor or owner may query |
| `GetDocumentAccessList` | read | owner only; marks expired |
| `GetDoctorAuthorizedDocuments` | read | the doctor themselves |
| `GrantConsent` / `RevokeConsent` / `GetConsent` | write/write/read | consent lifecycle |
| `CreateClaim` / `UpdateClaimStatus` / `GetClaim` | write/write/read | patient / provider roles |
| `RecordAuditEvent` / `GetAuditHistory` | write/read | owner only |

## Security model

- **Default: NO ACCESS.** Uploading grants nobody anything.
- Access is **document-specific** and **expiring** — enforced in chaincode.
- Only the **document owner** can grant or revoke (checked by the backend
  authenticated wallet + recorded as the `grantedBy` actor).
- Fabric stores **metadata only** (CID, hash, type, filename, permissions,
  audit). The encrypted file stays on IPFS; keys never leave the backend.
- When Fabric is unreachable, doctor access is **denied closed** (503 with a
  clear message) — it never falls back to the old connection-based behaviour.

## Tests

Chaincode unit tests (no network required):
```bash
cd fabric-network/chaincode
npm test
```
15 tests cover creation, duplicate rejection, ownership checks, grant/revoke,
expiry, doctor-document listing, claims, and the audit trail.

> Note: `chaincode/node_modules/fabric-contract-api/index.js` is a **local test
> stub** used only for offline testing. `network.sh` deletes it and installs the
> real package before packaging the chaincode, so it never ships to a peer.

## Tests

```bash
# Chaincode unit tests (no network needed — mock stub)
cd fabric-network/chaincode && npm test          # 25 tests

# Backend tests (Fabric SDK mocked — no network needed)
cd backend && npm test                           # 17 tests
```

The chaincode suite covers creation, duplicate rejection, ownership checks,
grant/revoke/expiry, doctor document listing, per-document filtering, consent
lifecycle, claims, and audit-trail authorization (including denial paths).

## Remaining / known gaps

- **End-to-end verification** (Fabric up + backend + browser) must be done on
  a machine with Docker and npm registry access — the sandbox cannot run the
  network.
- Consent is now recorded on-chain: `POST /connection/accept` calls
  `GrantConsent` and `POST /connection/revoke` calls `RevokeConsent` (best
  effort — connection still works locally if Fabric is down).
- Insurance claims now have a patient-facing panel (new **Claims** tab) backed
  by `CreateClaim` / `GetPatientClaims`. A separate insurance-officer
  dashboard was not built (the app has no insurance role UI); status updates
  can be exercised via `POST /api/fabric/claims/:id/status`.
- The old Ethereum/Foundry demo scripts (`chain:*` npm scripts) were removed
  from `backend/package.json`; `ethers` remains only for MetaMask signature
  verification (user auth), not for any blockchain interaction.
- `chaincode/node_modules/fabric-contract-api/index.js` is a **local test
  stub** used only for offline testing. `.gitignore` excludes
  `fabric-network/chaincode/node_modules/`, and `network.sh deployChaincode`
  deletes the stub and installs the real package before packaging.
