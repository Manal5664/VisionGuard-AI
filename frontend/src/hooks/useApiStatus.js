import { useCallback, useEffect, useState } from "react";

export default function useApiStatus(apiBase, intervalMs = 30000) {
  const [status, setStatus] = useState("checking");

  const check = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${apiBase}/api/health`, { signal: controller.signal });
      setStatus(response.ok ? "online" : "offline");
    } catch {
      setStatus("offline");
    } finally {
      clearTimeout(timeoutId);
    }
  }, [apiBase]);

  useEffect(() => {
    check();
    const timer = setInterval(check, intervalMs);
    return () => clearInterval(timer);
  }, [check, intervalMs]);

  return { status, check };
}
