import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "./session";
import { ApiError } from "./api/client";
import type { ApiConfig } from "./api/client";
import { useApiMutation } from "./query/use-api-mutation";

export type MutateFlash = {
  success?: string;
  error?: string;
  successParams?: Record<string, string | number>;
  /** Default `success`: toast after API. Use `immediate` with optimistic UI. */
  when?: "immediate" | "success";
};

/** Data-loading hook: runs the fetcher with the current session config,
 *  exposes { data, loading, error, refresh }. Signs out on 401. */
export function useApi<T>(
  fetcher: (config: ApiConfig) => Promise<T>,
  deps: unknown[] = []
) {
  const { token, serverUrl, signOut } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!token || !serverUrl) return;
    const mySeq = ++seq.current;
    setError(null);
    try {
      const result = await fetcher({ token, serverUrl });
      if (seq.current === mySeq) setData(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
        return;
      }
      if (seq.current === mySeq) {
        setError(err instanceof Error ? err.message : "error");
      }
    } finally {
      if (seq.current === mySeq) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, serverUrl, ...deps]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return { data, loading, error, refresh: load };
}

/** Config + runner for one-off mutations from event handlers. Delegated to useApiMutation. */
export function useMutate() {
  const { run, busy, isPending } = useApiMutation();
  return { run, busy, isPending };
}

export const todayLocalISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};
