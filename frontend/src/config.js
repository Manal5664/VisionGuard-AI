const DEFAULT_API_BASE = "http://127.0.0.1:8000";

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE = (configuredApiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
