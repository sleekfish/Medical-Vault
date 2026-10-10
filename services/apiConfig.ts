/** Public address of the API service; this never contains a secret. */
export const API_BASE_URL = (
    import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"
).replace(/\/$/, "");
