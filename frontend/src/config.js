const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();

// Production sets VITE_API_BASE_URL. Local Vite development uses the proxy in
// vite.config.js, so localhost is never embedded in the production browser bundle.
export const API_BASE = (configuredApiBase || "").replace(/\/+$/, "");
