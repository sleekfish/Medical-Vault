function normaliseWallet(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * The production auth middleware must set req.auth.walletAddress after verifying
 * the user's session or wallet signature. The header fallback exists only for
 * local development, so an arbitrary browser header is never trusted in prod.
 */
function authenticatedWallet(req) {
    const wallet = normaliseWallet(req.auth?.walletAddress || req.user?.walletAddress);
    if (wallet) return wallet;

    if (process.env.NODE_ENV !== "production") {
        return normaliseWallet(req.get("x-wallet-address"));
    }
    return "";
}

export function createRequireRecordAccess({ records, connections }) {
    return (req, res, next) => {
        const requesterWallet = authenticatedWallet(req);
        if (!requesterWallet) {
            return res.status(401).json({ error: "Authentication is required to access this record." });
        }

        const record = records.find((item) => item.id === req.params.recordId);
        if (!record) return res.status(404).json({ error: "Record not found." });

        const isOwner = requesterWallet === record.patientWallet;
        const isConnectedDoctor = connections.some((connection) =>
            connection.status === "CONNECTED" &&
            connection.patientWallet === record.patientWallet &&
            connection.doctorWallet === requesterWallet
        );

        if (!isOwner && !isConnectedDoctor) {
            return res.status(403).json({ error: "You are not authorized to access this record." });
        }

        req.record = record;
        req.requesterWallet = requesterWallet;
        return next();
    };
}
