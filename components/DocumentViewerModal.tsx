import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Shield, Lock, FileText, AlertCircle, RefreshCw, Copy } from "./ui/Icons";
import { MedicalRecord } from "../types";
import { fetchDecryptedMedicalFile, fetchFromIPFS, isRealCid, IPFS_GATEWAYS } from "../services/ipfsService";
import { getWalletAccessToken, clearWalletAccessToken } from "../services/walletAuthService";
import * as pdfjsLib from "pdfjs-dist";
// Vite-style worker import — swap for your bundler's equivalent
// (e.g. `pdfjs-dist/build/pdf.worker.min.mjs` via CRA/webpack asset import,
// or a CDN URL) if you're not on Vite.
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    record: MedicalRecord | null;
    requesterWallet?: string;
    allowDownload?: boolean;
}

type ViewState = "loading" | "ready" | "error" | "mock";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:5000") as string;

function shortWallet(wallet: string) {
    if (!wallet) return "Unknown wallet";
    return `${wallet.slice(0, 8)}…${wallet.slice(-6)}`;
}

// Calls GET /api/medical-records/:recordId/secure-export on the backend.
// That route retrieves the encrypted object from IPFS, verifies its
// SHA-256 against the stored hash, and streams the ciphertext straight
// back — it never decrypts. The resulting .mvault file is therefore
// exactly the AES-256-GCM encrypted blob that was originally pinned.
async function secureExport(recordId: string, wallet: string): Promise<Blob> {
    const request = (token: string) => fetch(
        `${BACKEND_URL}/api/medical-records/${encodeURIComponent(recordId)}/secure-export`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/octet-stream",
            },
            cache: "no-store",
        }
    );

    let response = await request(await getWalletAccessToken(wallet));

    if (response.status === 401) {
        clearWalletAccessToken(wallet);
        response = await request(await getWalletAccessToken(wallet, true));
    }

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Secure export failed (${response.status})`);
    }

    return response.blob();
}

const DocumentViewerModal: React.FC<Props> = ({
                                                  isOpen,
                                                  onClose,
                                                  record,
                                                  requesterWallet = "",
                                                  allowDownload = false,
                                              }) => {
    const [viewState, setViewState] = useState<ViewState>("loading");
    const [fileBlob, setFileBlob] = useState<Blob | null>(null);
    const [mimeType, setMimeType] = useState("application/octet-stream");
    const [errorMessage, setErrorMessage] = useState("");
    const [downloading, setDownloading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [zoom, setZoom] = useState(1);
    const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // PDF rendering state — pages are decoded to canvas pixels via pdfjs-dist
    // rather than handed to the browser's native PDF viewer (an <iframe> or
    // <embed> pointed at a PDF blob spawns a plugin with its own Save/Print/
    // Inspect context menu that lives outside the page's DOM and can't be
    // suppressed by our document-level contextmenu blocker below).
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [pdfPageCount, setPdfPageCount] = useState(0);
    const [pdfPageNum, setPdfPageNum] = useState(1);
    const [pdfError, setPdfError] = useState("");
    const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const pdfViewportRef = useRef<HTMLDivElement | null>(null);
    const [pdfContainerSize, setPdfContainerSize] = useState({ width: 0, height: 0 });

    const handleClose = useCallback(() => {
        setZoom(1);
        setCopied(false);
        onClose();
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") handleClose();
            if ((event.ctrlKey || event.metaKey) && ["s", "p", "u"].includes(event.key.toLowerCase())) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        const block = (event: Event) => event.preventDefault();

        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("contextmenu", block, true);
        document.addEventListener("dragstart", block, true);

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            document.removeEventListener("contextmenu", block, true);
            document.removeEventListener("dragstart", block, true);
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen, handleClose]);

    useEffect(() => {
        if (!isOpen || !record) return;

        let cancelled = false;

        setViewState("loading");
        setErrorMessage("");
        setFileBlob(null);
        setPdfDoc(null);
        setPdfPageCount(0);
        setPdfPageNum(1);
        setPdfError("");
        setZoom(1);

        const cid = record.ipfsCid;

        if (!isRealCid(cid)) {
            setViewState("mock");
            return;
        }

        const load = async () => {
            try {
                const blob = record.backendRecordId
                    ? await fetchDecryptedMedicalFile(record.backendRecordId, requesterWallet)
                    : await fetchFromIPFS(cid);

                if (cancelled) return;
                if (!blob) throw new Error("The medical record could not be retrieved.");

                let mime = blob.type || "application/octet-stream";
                const name = (record.name || "").toLowerCase();

                if (mime === "application/octet-stream") {
                    if (name.endsWith(".pdf")) mime = "application/pdf";
                    else if (name.endsWith(".png")) mime = "image/png";
                    else if (name.endsWith(".jpg") || name.endsWith(".jpeg")) mime = "image/jpeg";
                    else if (name.endsWith(".gif")) mime = "image/gif";
                }

                setMimeType(mime);
                setFileBlob(blob);
                setViewState("ready");
            } catch (error) {
                if (cancelled) return;
                setErrorMessage(error instanceof Error ? error.message : "Unable to load the record.");
                setViewState("error");
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [isOpen, record?.ipfsCid, record?.backendRecordId, requesterWallet]);

    // Decode the PDF into a pdfjs document once the plaintext blob is ready.
    // This never touches the DOM directly and never creates a blob: URL for
    // the browser to hand off to its native PDF plugin.
    useEffect(() => {
        if (viewState !== "ready" || !fileBlob || mimeType !== "application/pdf") return;

        let cancelled = false;
        let doc: pdfjsLib.PDFDocumentProxy | null = null;

        const openPdf = async () => {
            try {
                const arrayBuffer = await fileBlob.arrayBuffer();
                doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                if (cancelled) {
                    void doc.destroy();
                    return;
                }
                setPdfDoc(doc);
                setPdfPageCount(doc.numPages);
                setPdfPageNum(1);
                setPdfError("");
            } catch (error) {
                if (cancelled) return;
                console.error("[DocumentViewer] PDF decode failed:", error);
                setPdfError(error instanceof Error ? error.message : "Unable to open this PDF.");
            }
        };

        void openPdf();

        return () => {
            cancelled = true;
            void doc?.destroy();
        };
    }, [fileBlob, mimeType, viewState]);

    // Keep the PDF viewport dimensions in sync with the modal. This is what
    // makes 100% mean "fit to the available viewer area" while still allowing
    // 110%-250% to create a real scrollable page instead of being squeezed by
    // max-width: 100%.
    useEffect(() => {
        if (viewState !== "ready" || mimeType !== "application/pdf") return;

        const element = pdfViewportRef.current;
        if (!element) return;

        const updateSize = () => {
            setPdfContainerSize({
                width: element.clientWidth,
                height: element.clientHeight,
            });
        };

        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(element);

        return () => observer.disconnect();
    }, [viewState, mimeType]);

    // Render the current PDF page to canvas pixels whenever the page, zoom,
    // document, or available viewport size changes.
    useEffect(() => {
        if (!pdfDoc || mimeType !== "application/pdf") return;

        let cancelled = false;
        let renderTask: ReturnType<pdfjsLib.PDFPageProxy["render"]> | null = null;

        const renderPage = async () => {
            try {
                const page = await pdfDoc.getPage(pdfPageNum);
                if (cancelled) return;

                const canvas = pdfCanvasRef.current;
                const ctx = canvas?.getContext("2d");
                if (!canvas || !ctx) return;

                if (pdfContainerSize.width <= 0 || pdfContainerSize.height <= 0) return;

                const baseViewport = page.getViewport({ scale: 1 });
                const availableWidth = Math.max(1, pdfContainerSize.width - 48);
                const availableHeight = Math.max(1, pdfContainerSize.height - 48);

                // 100% = fit the whole page into the available viewer area.
                // Higher values deliberately make the canvas larger than the
                // viewport so the surrounding container can scroll naturally.
                const fitScale = Math.min(
                    availableWidth / baseViewport.width,
                    availableHeight / baseViewport.height
                );
                const cssScale = Math.max(0.05, fitScale * zoom);
                const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
                const renderScale = cssScale * deviceScale;
                const viewport = page.getViewport({ scale: renderScale });

                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                canvas.style.width = `${Math.ceil(baseViewport.width * cssScale)}px`;
                canvas.style.height = `${Math.ceil(baseViewport.height * cssScale)}px`;

                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                renderTask = page.render({ canvasContext: ctx, viewport });
                await renderTask.promise;
            } catch (error) {
                if (cancelled) return;
                console.error("[DocumentViewer] PDF page render failed:", error);
            }
        };

        void renderPage();

        return () => {
            cancelled = true;
            renderTask?.cancel();
        };
    }, [pdfDoc, pdfPageNum, zoom, mimeType, pdfContainerSize.width, pdfContainerSize.height]);

    useEffect(() => {
        if (viewState !== "ready" || !fileBlob || !mimeType.startsWith("image/")) return;

        let cancelled = false;

        const render = async () => {
            try {
                const bitmap = await createImageBitmap(fileBlob);
                if (cancelled) {
                    bitmap.close();
                    return;
                }

                const canvas = imageCanvasRef.current;
                const ctx = canvas?.getContext("2d");
                if (!canvas || !ctx) {
                    bitmap.close();
                    return;
                }

                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(bitmap, 0, 0);
                bitmap.close();
            } catch (error) {
                console.error("[DocumentViewer] Canvas render failed:", error);
            }
        };

        void render();
        return () => { cancelled = true; };
    }, [fileBlob, mimeType, viewState]);

    const handleSecureExport = async () => {
        if (!record?.backendRecordId || !requesterWallet) {
            alert("Secure export is available only for authenticated records.");
            return;
        }

        setDownloading(true);

        try {
            const encryptedBlob = await secureExport(record.backendRecordId, requesterWallet);
            const url = URL.createObjectURL(encryptedBlob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `MedicalVault_${record.backendRecordId}.mvault`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            console.error("[DocumentViewer] Secure export failed:", error);
            alert(error instanceof Error ? error.message : "Secure export failed.");
        } finally {
            setDownloading(false);
        }
    };

    const copyHash = async () => {
        if (!record?.hash) return;
        try {
            await navigator.clipboard.writeText(record.hash);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error("Could not copy hash:", error);
        }
    };

    if (!isOpen || !record) return null;

    const cid = record.ipfsCid;
    const isPdf = mimeType === "application/pdf";
    const isImg = mimeType.startsWith("image/");

    return createPortal(
        <div
            className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) handleClose();
            }}
            onContextMenu={(event) => event.preventDefault()}
        >
            <div
                className="relative w-full max-w-[1500px] h-[96vh] bg-[#0b0b0b] border border-white/10 rounded-2xl shadow-[0_30px_120px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
                onMouseDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
            >
                <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b border-white/10 bg-[#0b0b0b] flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center flex-shrink-0">
                            <FileText size={17} className="text-sky-400" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-white font-bold text-sm sm:text-base truncate">{record.name}</h3>
                            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 truncate">
                                {record.date} · {record.type} · {record.category ?? "Uploaded"}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={handleClose} aria-label="Close document viewer" className="flex items-center justify-center w-11 h-11 rounded-xl border border-white/20 bg-[#181818] text-white hover:bg-red-500 hover:border-red-400 transition-all shadow-lg">
                        <X size={22} />
                    </button>
                </div>

                <div className="px-4 sm:px-6 py-3 border-b border-white/10 bg-[#0b0b0b] flex flex-wrap gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full"><Shield size={11} /> Notarized on-chain</span>
                    <span className="flex items-center gap-1 text-xs text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-full"><Lock size={11} /> AES-256-GCM</span>
                    <span className="text-xs text-gray-500 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full font-mono">CID: {cid ? `${cid.slice(0, 16)}…` : "N/A"}</span>
                    {viewState === "ready" && <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full"><Shield size={11} /> Authorized viewer</span>}
                </div>

                <div className="flex-1 min-h-0 overflow-hidden bg-black p-3 sm:p-5" onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
                    {viewState === "loading" && (
                        <div className="h-full flex flex-col items-center justify-center gap-3">
                            <RefreshCw size={30} className="text-sky-400 animate-spin" />
                            <p className="text-white text-sm font-medium">Authorizing and decrypting record…</p>
                            <p className="text-gray-500 text-xs">Decrypted content is not used as the download source.</p>
                        </div>
                    )}

                    {viewState === "mock" && (
                        <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                            <AlertCircle size={40} className="text-amber-400" />
                            <p className="text-gray-300 text-sm">This record does not have a live IPFS CID.</p>
                        </div>
                    )}

                    {viewState === "error" && (
                        <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                            <AlertCircle size={40} className="text-red-400" />
                            <p className="text-gray-300 text-sm max-w-md">{errorMessage || "Unable to load this record."}</p>
                        </div>
                    )}

                    {viewState === "ready" && isImg && (
                        <div className="relative w-full h-full rounded-xl overflow-hidden border border-white/10 bg-black">
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-2 rounded-xl border border-white/10 bg-[#111]/95 backdrop-blur-xl shadow-2xl">
                                <button type="button" onClick={() => setZoom(z => Math.max(0.3, Number((z - 0.1).toFixed(2))))} disabled={zoom <= 0.3} className="w-9 h-9 rounded-lg text-white hover:bg-white/10 disabled:opacity-30 text-lg">−</button>
                                <span className="min-w-[65px] text-center text-sm font-semibold text-white">{Math.round(zoom * 100)}%</span>
                                <button type="button" onClick={() => setZoom(z => Math.min(3, Number((z + 0.1).toFixed(2))))} disabled={zoom >= 3} className="w-9 h-9 rounded-lg text-white hover:bg-white/10 disabled:opacity-30 text-lg">+</button>
                                <button type="button" onClick={() => setZoom(1)} className="w-9 h-9 rounded-lg text-gray-300 hover:text-white hover:bg-white/10">↻</button>
                            </div>

                            <div className="w-full h-full overflow-auto flex items-center justify-center p-6">
                                <canvas
                                    ref={imageCanvasRef}
                                    draggable={false}
                                    onContextMenu={(event) => event.preventDefault()}
                                    className="block rounded-lg shadow-2xl select-none pointer-events-none"
                                    style={{
                                        width: `${zoom * 100}%`,
                                        maxWidth: zoom <= 1 ? "100%" : "none",
                                        maxHeight: zoom <= 1 ? "100%" : "none",
                                        objectFit: "contain",
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {viewState === "ready" && isPdf && pdfError && (
                        <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                            <AlertCircle size={40} className="text-red-400" />
                            <p className="text-gray-300 text-sm max-w-md">{pdfError}</p>
                        </div>
                    )}

                    {viewState === "ready" && isPdf && !pdfError && (
                        <div className="relative w-full h-full rounded-xl overflow-hidden border border-white/10 bg-[#111]">
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-2 rounded-xl border border-white/10 bg-[#111]/95 backdrop-blur-xl shadow-2xl">
                                <button type="button" onClick={() => setPdfPageNum(p => Math.max(1, p - 1))} disabled={pdfPageNum <= 1} className="w-9 h-9 rounded-lg text-white hover:bg-white/10 disabled:opacity-30 flex items-center justify-center">
                                    <span className="text-lg leading-none">‹</span>
                                </button>
                                <span className="min-w-[70px] text-center text-sm font-semibold text-white">
                                    {pdfPageCount ? `${pdfPageNum} / ${pdfPageCount}` : "…"}
                                </span>
                                <button type="button" onClick={() => setPdfPageNum(p => Math.min(pdfPageCount, p + 1))} disabled={pdfPageNum >= pdfPageCount} className="w-9 h-9 rounded-lg text-white hover:bg-white/10 disabled:opacity-30 flex items-center justify-center">
                                    <span className="text-lg leading-none">›</span>
                                </button>
                                <div className="w-px h-6 bg-white/10 mx-1" />
                                <button type="button" onClick={() => setZoom(z => Math.max(0.5, Number((z - 0.1).toFixed(2))))} disabled={zoom <= 0.5} className="w-9 h-9 rounded-lg text-white hover:bg-white/10 disabled:opacity-30 text-lg">−</button>
                                <span className="min-w-[55px] text-center text-sm font-semibold text-white">{Math.round(zoom * 100)}%</span>
                                <button type="button" onClick={() => setZoom(z => Math.min(2.5, Number((z + 0.1).toFixed(2))))} disabled={zoom >= 2.5} className="w-9 h-9 rounded-lg text-white hover:bg-white/10 disabled:opacity-30 text-lg">+</button>
                            </div>

                            <div
                                ref={pdfViewportRef}
                                className="w-full h-full overflow-auto p-6"
                                onContextMenu={(event) => event.preventDefault()}
                            >
                                <div className="min-w-full min-h-full flex items-center justify-center">
                                    <canvas
                                        ref={pdfCanvasRef}
                                        draggable={false}
                                        onContextMenu={(event) => event.preventDefault()}
                                        className="block rounded-lg shadow-2xl select-none pointer-events-none bg-white flex-shrink-0"
                                    />
                                </div>
                            </div>

                            <div className="absolute top-3 left-3 pointer-events-none px-3 py-1.5 rounded-lg bg-black/75 text-[10px] text-green-300 border border-green-500/20">
                                AUTHORIZED VIEW · EXPORTS ARE ENCRYPTED
                            </div>
                        </div>
                    )}

                    {viewState === "ready" && !isPdf && !isImg && (
                        <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                            <FileText size={42} className="text-gray-400" />
                            <p className="text-white font-semibold">{record.name}</p>
                            <p className="text-gray-400 text-sm">Preview unavailable for this file type.</p>
                        </div>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3 border-t border-white/10 bg-[#0b0b0b] flex-shrink-0 gap-3">
                    <button type="button" onClick={copyHash} title="Copy SHA-256 hash" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 font-mono truncate w-full sm:flex-1 text-left">
                        <Copy size={11} />
                        {copied ? "Copied!" : `SHA-256: ${record.hash?.slice(0, 32) ?? "N/A"}…`}
                    </button>

                    <div className="flex gap-2 flex-shrink-0 w-full sm:w-auto">
                        <div className="hidden md:flex items-center gap-1.5 text-[10px] text-gray-500 px-3">
                            <Lock size={12} className="text-sky-400" /> Plaintext never downloaded
                        </div>

                        {allowDownload && isRealCid(cid) && record.backendRecordId && (
                            <button
                                type="button"
                                onClick={handleSecureExport}
                                disabled={downloading || viewState === "loading"}
                                className="flex items-center justify-center gap-1.5 text-xs bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg disabled:opacity-60 transition-all font-semibold flex-1 sm:flex-none"
                            >
                                {downloading ? <RefreshCw size={13} className="animate-spin" /> : <Lock size={13} />}
                                {downloading ? "Preparing encrypted file…" : "Secure Export (.mvault)"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default DocumentViewerModal;