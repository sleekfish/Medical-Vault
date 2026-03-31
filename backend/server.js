import express  from "express";
import cors     from "cors";
import multer   from "multer";
import FormData from "form-data";
import axios    from "axios";
import crypto   from "crypto";
import dotenv   from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join }  from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const app    = express();
const upload = multer();

app.use(cors({ origin: "*", methods: ["GET","POST","PUT","DELETE","OPTIONS"], allowedHeaders: ["Content-Type","Authorization"] }));
app.use(express.json());

// ─── File-backed store ────────────────────────────────────────────────────────
const DB = join(__dirname, "connections.json");

function loadDB() {
    try { if (existsSync(DB)) return JSON.parse(readFileSync(DB, "utf8")); } catch {}
    return { connections: [], appointments: [], records: [], prescriptions: [] };
}

function saveDB() {
    try {
        writeFileSync(DB, JSON.stringify(
            { connections, appointments, records, prescriptions }, null, 2
        ));
    } catch(e) { console.error("[DB] save error:", e.message); }
}

const db          = loadDB();
let connections   = db.connections   || [];
let appointments  = db.appointments  || [];
let records       = db.records       || [];
let prescriptions = db.prescriptions || [];   // ← was missing entirely

const fakeTx = () => "0x" + crypto.randomBytes(32).toString("hex");

console.log(`[DB] Loaded: ${connections.length} connections, ${records.length} records, ${prescriptions.length} prescriptions`);
connections.forEach(c => console.log(`  - [${c.status}] id=${c.id}  patient=${c.patientWallet?.slice(0,10)}  doctor=${c.doctorWallet?.slice(0,10)}`));

// ══════════════════════════════════════════════════════════════════════════════
//  IPFS UPLOAD
// ══════════════════════════════════════════════════════════════════════════════
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "No file" });
        const jwt = process.env.VITE_PINATA_JWT;
        if (!jwt) return res.status(500).json({ error: "VITE_PINATA_JWT not set" });
        const fd = new FormData();
        fd.append("file", file.buffer, { filename: file.originalname, contentType: file.mimetype });
        fd.append("pinataMetadata", JSON.stringify({ name: file.originalname }));
        const response = await axios.post(
            "https://api.pinata.cloud/pinning/pinFileToIPFS", fd,
            { headers: { ...fd.getHeaders(), Authorization: `Bearer ${jwt}` }, maxContentLength: Infinity, maxBodyLength: Infinity }
        );
        console.log("[Upload] ✓ CID:", response.data.IpfsHash);
        res.json({ cid: response.data.IpfsHash });
    } catch (err) {
        console.error("[Upload] Error:", err.response?.data || err.message);
        res.status(500).json({ error: "Upload failed", details: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
//  RECORDS API
// ══════════════════════════════════════════════════════════════════════════════
app.post("/records/save", (req, res) => {
    const { patientWallet, fileName, ipfsCid, fileHash, fileType, fileSize, category } = req.body;
    if (!patientWallet || !ipfsCid || !fileName)
        return res.status(400).json({ error: "patientWallet, ipfsCid, fileName required" });
    const record = {
        id:            `rec-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        patientWallet: patientWallet.toLowerCase().trim(),
        fileName, ipfsCid,
        fileHash:   fileHash  || "",
        fileType:   fileType  || "PDF",
        fileSize:   fileSize  || "",
        category:   category  || "Uploaded",
        uploadedAt: new Date().toISOString(),
        fileUrl:    `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
    };
    records.push(record);
    saveDB();
    console.log(`[Records] SAVED  patient=${patientWallet.slice(0,10)}  file=${fileName}`);
    res.json({ record, ok: true });
});

app.get("/records/patient/:wallet", (req, res) => {
    const pw = req.params.wallet.toLowerCase().trim();
    res.json(records.filter(r => r.patientWallet === pw));
});

app.get("/records/my/:wallet", (req, res) => {
    const pw = req.params.wallet.toLowerCase().trim();
    res.json(records.filter(r => r.patientWallet === pw));
});

// ══════════════════════════════════════════════════════════════════════════════
//  PRESCRIPTIONS API  ← THIS WAS THE MISSING SECTION
// ══════════════════════════════════════════════════════════════════════════════

// Doctor saves a prescription → patient can immediately fetch it
app.post("/prescriptions/save", (req, res) => {
    const { patientWallet, doctorWallet, doctorName, medication, dosage, duration, notes } = req.body;

    if (!patientWallet || !medication || !dosage)
        return res.status(400).json({ error: "patientWallet, medication and dosage are required" });

    const pw   = patientWallet.toLowerCase().trim();
    const dw   = (doctorWallet || "").toLowerCase().trim();
    const days = parseInt(duration) || 30;

    const issued = new Date();
    const expiry = new Date(issued.getTime() + days * 24 * 60 * 60 * 1000);

    const prescription = {
        id:            `rx-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        patientWallet: pw,
        doctorWallet:  dw,
        doctorName:    doctorName || "Doctor",
        medication,
        dosage,
        duration:      `${days} days`,
        notes:         notes || "",
        issuedDate:    issued.toISOString().split("T")[0],
        expiryDate:    expiry.toISOString().split("T")[0],
        txHash:        fakeTx(),
        verified:      true,
        createdAt:     new Date().toISOString(),
    };

    prescriptions.push(prescription);
    saveDB();
    console.log(`[Rx] SAVED  id=${prescription.id}  doctor=${dw.slice(0,10)}  patient=${pw.slice(0,10)}  med=${medication}`);
    res.json({ prescription, ok: true });
});

// Patient fetches their prescriptions (called by PatientDashboard)
app.get("/prescriptions/patient/:wallet", (req, res) => {
    const pw     = req.params.wallet.toLowerCase().trim();
    const result = prescriptions.filter(p => p.patientWallet === pw);
    console.log(`[Rx] FETCH patient  wallet=${pw.slice(0,10)}  found=${result.length}`);
    res.json(result);
});

// Doctor fetches prescriptions they wrote (called by DoctorDashboard)
app.get("/prescriptions/doctor/:wallet", (req, res) => {
    const dw     = req.params.wallet.toLowerCase().trim();
    const result = prescriptions.filter(p => p.doctorWallet === dw);
    console.log(`[Rx] FETCH doctor  wallet=${dw.slice(0,10)}  found=${result.length}`);
    res.json(result);
});

// ══════════════════════════════════════════════════════════════════════════════
//  CONNECTION API
// ══════════════════════════════════════════════════════════════════════════════

app.post("/connection/request", (req, res) => {
    const { patientWallet, patientName, doctorWallet, doctorName } = req.body;
    if (!patientWallet || !doctorWallet)
        return res.status(400).json({ error: "patientWallet and doctorWallet required" });

    const pw = patientWallet.toLowerCase().trim();
    const dw = doctorWallet.toLowerCase().trim();

    const existing = connections.find(c =>
        c.patientWallet === pw && c.doctorWallet === dw &&
        c.status !== "REVOKED" && c.status !== "REJECTED"
    );
    if (existing) {
        console.log(`[Request] Already exists: ${existing.status}`);
        return res.json({ connection: existing, isNew: false });
    }

    const conn = {
        id:            `conn-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        patientWallet: pw,
        doctorWallet:  dw,
        patientName:   patientName || "Patient",
        doctorName:    doctorName  || "Doctor",
        status:        "PENDING",
        requestedAt:   new Date().toISOString(),
        connectedAt:   null,
        txHash:        null,
    };
    connections.push(conn);
    saveDB();
    console.log(`[Request] NEW id=${conn.id}  patient=${pw.slice(0,10)}  doctor=${dw.slice(0,10)}`);
    res.json({ connection: conn, isNew: true });
});

app.get("/connection/doctor/:wallet", (req, res) => {
    const dw     = req.params.wallet.toLowerCase().trim();
    const result = connections.filter(c => c.doctorWallet === dw);
    console.log(`[Poll] Doctor ${dw.slice(0,10)}… → ${result.length} connections`);
    res.json(result);
});

app.get("/connection/patient/:wallet", (req, res) => {
    const pw = req.params.wallet.toLowerCase().trim();
    res.json(connections.filter(c => c.patientWallet === pw));
});

// Accept by ID
app.post("/connection/accept/:id", (req, res) => {
    const id   = req.params.id?.trim();
    console.log(`[Accept] id="${id}"  known=[${connections.map(c => c.id).join(", ")}]`);
    const conn = connections.find(c => c.id === id);
    if (!conn) {
        return res.status(404).json({
            error: `Connection not found: "${id}"`,
            available: connections.map(c => ({ id: c.id, status: c.status })),
        });
    }
    if (conn.status !== "PENDING") return res.json(conn); // idempotent
    conn.status = "CONNECTED"; conn.connectedAt = new Date().toISOString(); conn.txHash = fakeTx();
    saveDB();
    console.log(`[Accept] ✓ CONNECTED id=${id}`);
    res.json(conn);
});

// Accept by wallet (fallback)
app.post("/connection/accept", (req, res) => {
    const pw = (req.body.patientWallet || "").toLowerCase().trim();
    const dw = (req.body.doctorWallet  || "").toLowerCase().trim();
    const conn = connections.find(c => c.patientWallet === pw && c.doctorWallet === dw && c.status === "PENDING");
    if (!conn) return res.status(404).json({ error: "No pending connection found" });
    conn.status = "CONNECTED"; conn.connectedAt = new Date().toISOString(); conn.txHash = fakeTx();
    saveDB();
    console.log(`[Accept/wallet] ✓ CONNECTED id=${conn.id}`);
    res.json(conn);
});

// Reject by ID
app.post("/connection/reject/:id", (req, res) => {
    const conn = connections.find(c => c.id === req.params.id?.trim());
    if (!conn) return res.status(404).json({ error: `Not found: "${req.params.id}"` });
    conn.status = "REJECTED"; saveDB();
    console.log(`[Reject] ✓ id=${req.params.id}`);
    res.json(conn);
});

// Reject by wallet (fallback)
app.post("/connection/reject", (req, res) => {
    const pw = (req.body.patientWallet || "").toLowerCase().trim();
    const dw = (req.body.doctorWallet  || "").toLowerCase().trim();
    const conn = connections.find(c => c.patientWallet === pw && c.doctorWallet === dw && c.status === "PENDING");
    if (!conn) return res.status(404).json({ error: "No pending connection found" });
    conn.status = "REJECTED"; saveDB(); res.json(conn);
});

// Revoke by ID
app.post("/connection/revoke/:id", (req, res) => {
    const conn = connections.find(c => c.id === req.params.id?.trim());
    if (!conn) return res.status(404).json({ error: `Not found: "${req.params.id}"` });
    conn.status = "REVOKED"; saveDB();
    console.log(`[Revoke] ✓ id=${req.params.id}`);
    res.json(conn);
});

// Revoke by wallet (fallback)
app.post("/connection/revoke", (req, res) => {
    const pw = (req.body.patientWallet || "").toLowerCase().trim();
    const dw = (req.body.doctorWallet  || "").toLowerCase().trim();
    const conn = connections.find(c => c.patientWallet === pw && c.doctorWallet === dw && c.status === "CONNECTED");
    if (!conn) return res.status(404).json({ error: "No connected connection found" });
    conn.status = "REVOKED"; saveDB(); res.json(conn);
});

// ══════════════════════════════════════════════════════════════════════════════
//  APPOINTMENTS
// ══════════════════════════════════════════════════════════════════════════════
app.post("/book-appointment", (req, res) => {
    const appt = { ...req.body, id: "apt_" + Date.now() };
    appointments.push(appt);
    saveDB();
    res.json(appt);
});

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN / DEBUG
// ══════════════════════════════════════════════════════════════════════════════
app.get("/admin/connections",   (req, res) => res.json(connections));
app.get("/admin/records",       (req, res) => res.json(records));
app.get("/admin/prescriptions", (req, res) => res.json(prescriptions));
app.get("/connection/all",      (req, res) => res.json(connections));

app.get("/admin/clear-all", (req, res) => {
    const n = connections.length; connections = []; saveDB();
    res.json({ ok: true, cleared: n });
});
app.get("/admin/clear-records", (req, res) => {
    const n = records.length; records = []; saveDB();
    res.json({ ok: true, cleared: n });
});
app.get("/admin/clear-prescriptions", (req, res) => {
    const n = prescriptions.length; prescriptions = []; saveDB();
    res.json({ ok: true, cleared: n });
});

// ══════════════════════════════════════════════════════════════════════════════
//  LEGACY + HEALTH
// ══════════════════════════════════════════════════════════════════════════════
app.get("/access/:wallet",  (req, res) => res.json([]));
app.post("/grant-access",   (req, res) => res.json({ ok: true }));
app.post("/revoke-access",  (req, res) => res.json({ ok: true }));

app.get("/health", (req, res) => res.json({
    ok: true,
    connections:   connections.length,
    records:       records.length,
    prescriptions: prescriptions.length,
    ids: connections.map(c => ({ id: c.id, status: c.status })),
}));

app.get("/", (req, res) => res.send(`
    <html><body style="font-family:monospace;padding:2rem;background:#050505;color:#fff">
    <h2 style="color:#10b981">✅ Medical Vault Backend</h2>
    <p>Connections: <b>${connections.length}</b> &nbsp;|&nbsp;
       Records: <b>${records.length}</b> &nbsp;|&nbsp;
       Prescriptions: <b>${prescriptions.length}</b></p>
    <p>Pinata JWT: <b>${process.env.VITE_PINATA_JWT ? "✓ Set" : "✗ Missing"}</b></p>
    <p style="font-size:12px">
        <a href="/health"              style="color:#38bdf8;margin-right:1rem">/health</a>
        <a href="/admin/connections"   style="color:#a78bfa;margin-right:1rem">/admin/connections</a>
        <a href="/admin/records"       style="color:#10b981;margin-right:1rem">/admin/records</a>
        <a href="/admin/prescriptions" style="color:#f59e0b;margin-right:1rem">/admin/prescriptions</a>
        <a href="/admin/clear-all"     style="color:#f87171;margin-right:1rem" onclick="return confirm('Clear connections?')">/admin/clear-all</a>
        <a href="/admin/clear-prescriptions" style="color:#f87171" onclick="return confirm('Clear prescriptions?')">/admin/clear-prescriptions</a>
    </p>
    </body></html>
`));

// Catch-all 404 logger
app.use((req, res) => {
    console.warn(`[404] ${req.method} ${req.url}`);
    res.status(404).json({ error: `Route not found: ${req.method} ${req.url}` });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n✅  Medical Vault backend → http://localhost:${PORT}`);
    console.log(`   Prescriptions : POST /prescriptions/save`);
    console.log(`                   GET  /prescriptions/patient/:wallet`);
    console.log(`                   GET  /prescriptions/doctor/:wallet`);
    console.log(`   Records       : POST /records/save  |  GET /records/patient/:wallet`);
    console.log(`   Admin         : /admin/prescriptions  |  /admin/clear-prescriptions\n`);
    console.log(`    Pinata JWT: ${process.env.VITE_PINATA_JWT ? "✓ configured" : "✗ missing"}\n`);
});