import React, { useState, useEffect } from 'react';
import { X, Download, Shield, Lock, ExternalLink, FileText, AlertCircle, RefreshCw, Copy } from './ui/Icons';
import { MedicalRecord } from '../types';
import { fetchFromIPFS, isRealCid, IPFS_GATEWAYS } from '../services/ipfsService';

interface Props {
    isOpen:         boolean;
    onClose:        () => void;
    record:         MedicalRecord | null;
    allowDownload?: boolean;
}

type ViewState = "loading" | "ready" | "error" | "mock";

const DocumentViewerModal: React.FC<Props> = ({ isOpen, onClose, record, allowDownload = false }) => {
    const [viewState,   setViewState]   = useState<ViewState>("loading");
    const [objectUrl,   setObjectUrl]   = useState<string | null>(null);
    const [mimeType,    setMimeType]    = useState<string>("application/octet-stream");
    const [downloading, setDownloading] = useState(false);
    const [copied,      setCopied]      = useState(false);

    // Fetch file as blob whenever record changes
    useEffect(() => {
        if (!isOpen || !record) return;

        // Clean up previous object URL
        if (objectUrl) { URL.revokeObjectURL(objectUrl); setObjectUrl(null); }

        const cid = record.ipfsCid;

        // Mock CID — nothing to fetch
        if (!isRealCid(cid)) {
            setViewState("mock");
            return;
        }

        setViewState("loading");

        fetchFromIPFS(cid).then(blob => {
            if (!blob) { setViewState("error"); return; }

            // Determine MIME type from file name / record type
            let mime = blob.type;
            if (!mime || mime === "application/octet-stream") {
                const name = (record.name ?? "").toLowerCase();
                if (name.endsWith(".pdf"))                       mime = "application/pdf";
                else if (name.endsWith(".png"))                  mime = "image/png";
                else if (name.endsWith(".jpg") || name.endsWith(".jpeg")) mime = "image/jpeg";
                else if (name.endsWith(".gif"))                  mime = "image/gif";
                else if (record.type === "PDF")                  mime = "application/pdf";
                else if (record.type === "IMAGE")                mime = "image/jpeg";
            }
            setMimeType(mime);

            // Create a local blob URL — no CORS, no auth headers needed
            const url = URL.createObjectURL(new Blob([blob], { type: mime }));
            setObjectUrl(url);
            setViewState("ready");
        });

        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [isOpen, record?.ipfsCid]);

    // Cleanup on unmount
    useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, []);

    if (!isOpen || !record) return null;

    const cid   = record.ipfsCid;
    const isPdf = mimeType === "application/pdf";
    const isImg = mimeType.startsWith("image/");

    const handleDownload = async () => {
        setDownloading(true);
        try {
            if (objectUrl) {
                // Already fetched — reuse
                const a = document.createElement("a");
                a.href     = objectUrl;
                a.download = record.name ?? "medical-record";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                const blob = await fetchFromIPFS(cid);
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a   = document.createElement("a");
                    a.href     = url;
                    a.download = record.name ?? "medical-record";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } else {
                    window.open(`${IPFS_GATEWAYS[0]}${cid}`, "_blank");
                }
            }
        } catch {
            window.open(`${IPFS_GATEWAYS[0]}${cid}`, "_blank");
        }
        setDownloading(false);
    };

    const copyHash = () => {
        navigator.clipboard.writeText(record.hash);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
             onClick={onClose}>
            <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden"
                 style={{ maxHeight: "90vh" }}
                 onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold truncate">{record.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{record.date} · {record.type} · {record.category ?? "Uploaded"}</p>
                    </div>
                    <button onClick={onClose} className="ml-4 text-gray-500 hover:text-white transition-colors flex-shrink-0">
                        <X size={18} />
                    </button>
                </div>

                {/* ── Badges ── */}
                <div className="px-6 py-3 border-b border-white/5 flex flex-wrap gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">
                        <Shield size={11} /> Notarized on-chain
                    </span>
                    <span className="flex items-center gap-1 text-xs text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-full">
                        <Lock size={11} /> {record.encryptionType ?? "ChaCha20-Poly1305"}
                    </span>
                    <span className="text-xs text-gray-500 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full font-mono">
                        CID: {cid.slice(0, 16)}…
                    </span>
                    {viewState === "mock" && (
                        <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                            <AlertCircle size={11} /> Offline mock
                        </span>
                    )}
                    {viewState === "ready" && (
                        <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">
                            <Shield size={11} /> Fetched from IPFS
                        </span>
                    )}
                </div>

                {/* ── Content ── */}
                <div className="flex-1 overflow-hidden p-6 min-h-0" style={{ minHeight: 360 }}>

                    {/* Loading */}
                    {viewState === "loading" && (
                        <div className="h-full flex flex-col items-center justify-center gap-3">
                            <RefreshCw size={28} className="text-sky-400 animate-spin" />
                            <p className="text-white text-sm font-medium">Fetching from IPFS…</p>
                            <p className="text-gray-500 text-xs">Trying {IPFS_GATEWAYS.length} gateways</p>
                        </div>
                    )}

                    {/* Mock CID */}
                    {viewState === "mock" && (
                        <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                            <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center">
                                <AlertCircle size={28} className="text-amber-400" />
                            </div>
                            <div>
                                <p className="text-white font-semibold mb-1">File not on IPFS yet</p>
                                <p className="text-gray-400 text-sm max-w-sm">
                                    This file was hashed locally but not uploaded to IPFS (backend was offline). The SHA-256 hash is verified.
                                </p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 text-left w-full max-w-md">
                                <p className="text-xs text-gray-500 mb-1">SHA-256 (verified locally)</p>
                                <p className="text-xs font-mono text-gray-300 break-all">{record.hash}</p>
                            </div>
                        </div>
                    )}

                    {/* All gateways failed */}
                    {viewState === "error" && (
                        <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center">
                                <AlertCircle size={28} className="text-red-400" />
                            </div>
                            <div>
                                <p className="text-white font-semibold mb-1">Could not load file</p>
                                <p className="text-gray-400 text-sm max-w-sm">All IPFS gateways failed. Try opening directly.</p>
                            </div>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {IPFS_GATEWAYS.slice(0, 3).map((gw, i) => (
                                    <a key={i} href={`${gw}${cid}`} target="_blank" rel="noreferrer"
                                       className="flex items-center gap-1.5 text-xs text-sky-400 border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 rounded-lg hover:bg-sky-500/20 transition-all">
                                        <ExternalLink size={11} /> Gateway {i + 1}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* File ready — PDF */}
                    {viewState === "ready" && objectUrl && isPdf && (
                        <iframe
                            src={objectUrl}
                            title={record.name}
                            className="w-full rounded-xl border-0"
                            style={{ height: "100%", minHeight: 340 }}
                        />
                    )}

                    {/* File ready — Image */}
                    {viewState === "ready" && objectUrl && isImg && (
                        <div className="h-full flex items-center justify-center bg-black/20 rounded-xl overflow-hidden">
                            <img src={objectUrl} alt={record.name}
                                 className="max-w-full max-h-full object-contain rounded-xl" />
                        </div>
                    )}

                    {/* File ready — unknown type */}
                    {viewState === "ready" && objectUrl && !isPdf && !isImg && (
                        <div className="h-full flex flex-col items-center justify-center gap-4">
                            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center">
                                <FileText size={28} className="text-gray-400" />
                            </div>
                            <p className="text-white font-semibold">{record.name}</p>
                            <p className="text-gray-400 text-sm">Preview unavailable for this file type.</p>
                            <button onClick={handleDownload}
                                    className="flex items-center gap-2 text-sm text-sky-400 border border-sky-500/20 bg-sky-500/10 px-4 py-2 rounded-lg hover:bg-sky-500/20 transition-all">
                                <Download size={14} /> Download to view
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 flex-shrink-0 gap-4">
                    <button onClick={copyHash}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 font-mono truncate flex-1 text-left transition-colors">
                        <Copy size={11} className="flex-shrink-0" />
                        {copied ? "Copied!" : `SHA-256: ${record.hash.slice(0, 32)}…`}
                    </button>
                    <div className="flex gap-2 flex-shrink-0">
                        {isRealCid(cid) && (
                            <a href={`${IPFS_GATEWAYS[0]}${cid}`} target="_blank" rel="noreferrer"
                               className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg hover:border-white/20 transition-all">
                                <ExternalLink size={13} /> Open in IPFS
                            </a>
                        )}
                        {allowDownload && isRealCid(cid) && (
                            <button onClick={handleDownload} disabled={downloading || viewState === "loading"}
                                    className="flex items-center gap-1.5 text-xs bg-sky-500 hover:bg-sky-600 text-white px-4 py-1.5 rounded-lg disabled:opacity-60 transition-all font-semibold">
                                <Download size={13} />
                                {downloading ? "Downloading…" : "Download"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocumentViewerModal;