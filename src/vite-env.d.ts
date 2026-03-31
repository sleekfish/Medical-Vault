/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_PINATA_JWT: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare global {
    interface Window {
        ethereum?: any; // Fixes MetaMask errors
    }
}