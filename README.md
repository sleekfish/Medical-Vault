<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

> **MediVault blockchain layer:** the record-access, consent, audit, and
> insurance-claim logic now runs on **Hyperledger Fabric**. See
> [FABRIC-MIGRATION.md](./FABRIC-MIGRATION.md) for the architecture and run
> steps, and `fabric-network/` for the network + chaincode.

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/temp/1

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env) to your Gemini API key
3. Run the app:
   `npm run dev`

## Encrypted medical-record uploads

Patient files now follow this server-controlled flow:

```text
Patient upload → AES-256-GCM encryption → encrypted file → IPFS → CID
                                         ↘ SHA-256(ciphertext) → record metadata
```

The browser never receives the AES key or the Pinata credential. Configure those
server-only values by copying `backend/.env.example` to `backend/.env` and setting:

```env
PINATA_JWT=your_server_only_pinata_jwt
PINATA_GATEWAY_URL=your-gateway.mypinata.cloud
PINATA_GATEWAY_TOKEN=your_server_only_gateway_access_token
ENCRYPTION_KEY_BASE64=base64_encoded_32_byte_key
```

`PINATA_GATEWAY_TOKEN` is optional when the configured gateway has Pinata access
controls enabled. Create a dedicated gateway access token/key in Pinata; do not
reuse the upload API JWT. MediVault sends the token only from the backend to
Pinata in an HTTP header. If the restricted gateway rejects a request, the
backend can retrieve only the AES-256-GCM ciphertext through public IPFS after
it authorizes the requesting wallet; the plaintext and AES key stay server-side.

Generate a key once in a secure environment (or, preferably, use your secret
manager):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Do not put either value in a `VITE_*` variable. The client `.env` contains only
public settings such as the backend address and optional public gateway.

Run the encryption checks with:

```bash
cd backend && npm test
```

### Foundry contract tooling

Foundry is installed locally under `backend/.foundry` for Windows, so no system
PATH changes are needed. Run these from `backend`:

```bash
npm run foundry:version
npm run chain:build
npm run chain:test
npm run chain:node
```

The Foundry configuration at `backend/foundry.toml` compiles the existing
`contracts/MedicalVault.sol` contract and keeps generated build files out of Git.

### Authorized decryption

`GET /api/medical-records/:recordId/download` first authorizes the requesting
wallet. The patient who owns the record and doctors with a `CONNECTED` consent
record may continue. It then retrieves the encrypted bytes from IPFS, verifies
their stored SHA-256 digest, and passes the ciphertext, IV, authentication tag,
and AAD to the server-side `DecryptionService`. A failed GCM tag fails closed.
Only the recovered file is returned with `Cache-Control: no-store`; the AES key
never leaves the server.

For local development the endpoint accepts `X-Wallet-Address`. In production,
your verified session or wallet-signature middleware must set
`req.auth.walletAddress`; the header is rejected.
