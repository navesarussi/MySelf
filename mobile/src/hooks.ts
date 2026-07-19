import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "./session";
import { ApiError } from "./api/client";
import type { ApiConfig } from "./api/client";
import { useI18n } from "./i18n";
import { useToast } from "./toast";

export type MutateFlash = {
  success?: string;
  error?: string;
  successParams?: Record<string, string | number>;
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

/** Config + runner for one-off mutations from event handlers. */
export function useMutate() {
  const { token, serverUrl, signOut } = useSession();
  const { t } = useI18n();
  const { show: showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T>(fn: (config: ApiConfig) => Promise<T>, flash?: MutateFlash): Promise<T | null> => {
      if (!token || !serverUrl) return null;
      setBusy(true);
      try {
        const result = await fn({ token, serverUrl });
        if (flash?.success) showToast(t(flash.success, flash.successParams), "success");
        return result;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await signOut();
        } else {
          const apiMsg = err instanceof ApiError ? err.message : "";
          if (flash?.error) showToast(t(flash.error), "error");
          else if (apiMsg && apiMsg !== "db_error") showToast(apiMsg, "error");
          else showToast(t("common.error"), "error");
        }
        return null;
      } finally {
        setBusy(false);
      }
    },
    [token, serverUrl, signOut, showToast, t]
  );

  return { run, busy };
}

export const todayLocalISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};
