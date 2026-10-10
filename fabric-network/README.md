# MediVault Hyperledger Fabric Network

A minimal, permissioned Fabric network for the MediVault college major project.

## Architecture

```
                    ┌─────────────────────────────┐
                    │     orderer.example.com     │  (Raft ordering service)
                    │          (port 7050)        │
                    └─────────────┬───────────────┘
                                  │  channel: medivault
              ┌───────────────────┴───────────────────┐
              │                                       │
    ┌─────────┴──────────┐                 ┌──────────┴─────────┐
    │ peer0.healthcare   │                 │ peer0.insurance    │
    │ HealthcareMSP      │                 │ InsuranceMSP       │
    │   (port 7051)      │                 │   (port 9051)      │
    └────────────────────┘                 └────────────────────┘
              │                                       │
        Patients, Doctors                        Insurance
        + Admin                                   + Admin
```

Two **Fabric organizations** represent the permissioned sides of the system:

| Organization  | MSP ID       | Holds identities for         |
|---------------|--------------|------------------------------|
| Healthcare    | HealthcareMSP | Patients, Doctors, Admin     |
| Insurance     | InsuranceMSP | Insurance officers, Admin    |

> The four **application roles** (PATIENT, DOCTOR, INSURANCE, ADMIN) are mapped
> to identities within these two organizations. Application role ≠ Fabric org.

## What lives here

```
fabric-network/
├── crypto-config.yaml         # Identity definitions (cryptogen)
├── configtx.yaml              # Channel + organization definitions
├── docker-compose.yml         # Orderer, 2 peers, CLI container
├── .env                       # Network constants used by scripts
├── scripts/
│   └── network.sh             # One script controls the whole network
├── chaincode/
│   ├── index.js               # Chaincode entry point
│   ├── lib/MediVaultContract.js  # All MediVault business logic
│   ├── package.json
│   ├── tests/                 # Standalone chaincode unit tests
└── (generated)
    ├── organizations/         # Crypto material (after `network.sh generate`)
    └── channel-artifacts/     # Channel blocks (after `createChannel`)
```

## Prerequisites

1. **Docker Desktop** installed and running (Windows) with WSL2 backend.
2. **Git Bash** (comes with Git for Windows) or WSL to run the bash script.

## Quick start (Windows, Git Bash)

From the `fabric-network` directory:

```bash
./scripts/network.sh full
```

This runs: `generate` → `up` → `createChannel` → `deployChaincode`.
Alternatively, run each step individually to see what happens:

```bash
./scripts/network.sh generate       # 1. Create identities/crypto
./scripts/network.sh up             # 2. Start containers
./scripts/network.sh createChannel  # 3. Create channel, join peers
./scripts/network.sh deployChaincode # 4. Install + approve + commit chaincode
```

## Verify the chaincode (without the network)

The chaincode ships with unit tests that run on a mocked Fabric stub:

```bash
cd chaincode
npm install        # installs fabric-contract-api, fabric-shim
npm test
```

> Note: if you have no npm registry access, a local stub in
> `chaincode/node_modules/fabric-contract-api/` lets the tests run anyway.
> Delete that stub after a real `npm install` so the genuine package is used.

## Chaincode transactions

| Function | Type | Purpose |
|---|---|---|
| `CreateMedicalRecord` | write | Store metadata (CID, SHA-256, type, owner) for one encrypted doc |
| `GetMedicalRecord` | read | Read metadata; caller needs owner OR doc-level permission |
| `VerifyMedicalRecord` | read | Compare a hash against the stored on-chain hash |
| `GetPatientRecords` | read | List a patient's records (docs filtered for non-owners) |
| `GrantDocumentAccess` | write | Patient grants one doctor VIEW on one document (1/7/30/∞ days) |
| `RevokeDocumentAccess` | write | Patient revokes a doctor's document access |
| `CheckDocumentAccess` | read | Authorize check; returns granted or throws |
| `GetDocumentAccessList` | read | Active permissions for a document (owner only) |
| `GetDoctorAuthorizedDocuments` | read | Documents a doctor may view (doctor only) |
| `GrantConsent` / `RevokeConsent` / `GetConsent` | write/write/read | Connection-level consent |
| `CreateClaim` / `UpdateClaimStatus` / `GetClaim` | write/write/read | Insurance claims |
| `RecordAuditEvent` / `GetAuditHistory` | write/read | Audit trail per document |

## Security model

- **Default: NO ACCESS.** Uploading a document grants nobody anything.
- Access is **document-specific**: patient → one document → one doctor → expiry.
- Only the **document owner** can grant or revoke.
- Expiry is enforced in the chaincode (`expiresAt` checked on every access).
- Fabric stores **metadata only** — never PDFs, keys, passwords, or tokens.

## Troubleshooting

- `cryptogen generate` fails → Docker not running; start Docker Desktop.
- Port conflicts on 7050/7051/9051 → stop other Fabric networks first
  (`docker ps` to see what's running).
- Chaincode install fails → check `fabric-network/chaincode/node_modules` was
  not shipped with a broken stub; run a real `npm install` there.
- To restart from scratch: `./scripts/network.sh cleanup && ./scripts/network.sh full`
