import { useCallback, useState } from "react";
import { useSession } from "../session";
import { ApiError, type ApiConfig } from "../api/client";
import { useI18n } from "../i18n";
import { useToast } from "../toast";
import type { MutateFlash } from "../hooks";

export type RunMutationOptions<T = unknown> = {
  flash?: MutateFlash;
  itemId?: string;
  onMutate?: () => void | (() => void) | Promise<void | (() => void)>;
  onSuccess?: (data: T) => void;
  onError?: (err: unknown) => void;
};

/**
 * Session-aware mutation runner with per-item pending tracking,
 * automatic 401 handling, optimistic rollback support, and flash toasts.
 */
export function useApiMutation() {
  const { token, serverUrl, signOut } = useSession();
  const { t } = useI18n();
  const { show: showToast } = useToast();
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [busyCount, setBusyCount] = useState(0);

  const isPending = useCallback(
    (id?: string) => {
      if (!id) return busyCount > 0;
      return pendingIds.has(id);
    },
    [busyCount, pendingIds]
  );

  const run = useCallback(
    async <T>(
      fn: (config: ApiConfig) => Promise<T>,
      optionsOrFlash?: RunMutationOptions<T> | MutateFlash
    ): Promise<T | null> => {
      if (!token || !serverUrl) return null;

      const opts: RunMutationOptions<T> =
        optionsOrFlash && "success" in optionsOrFlash
          ? { flash: optionsOrFlash as MutateFlash }
          : (optionsOrFlash as RunMutationOptions<T>) ?? {};

      const { flash, itemId, onMutate, onSuccess, onError } = opts;

      setBusyCount((c) => c + 1);
      if (itemId) {
        setPendingIds((prev) => new Set(prev).add(itemId));
      }

      let rollback: (() => void) | undefined = undefined;
      if (onMutate) {
        try {
          const res = await onMutate();
          if (typeof res === "function") rollback = res;
        } catch (mErr) {
          console.warn("[useApiMutation] onMutate error", mErr);
        }
      }

      try {
        const result = await fn({ token, serverUrl });
        if (flash?.success) {
          showToast(t(flash.success, flash.successParams), "success");
        }
        onSuccess?.(result);
        return result;
      } catch (err) {
        if (typeof rollback === "function") {
          try {
            rollback();
          } catch (rErr) {
            console.warn("[useApiMutation] rollback error", rErr);
          }
        }

        if (err instanceof ApiError && err.status === 401) {
          await signOut();
        } else {
          const apiMsg = err instanceof ApiError ? err.message : "";
          if (flash?.error) showToast(t(flash.error), "error");
          else if (apiMsg && apiMsg !== "db_error") showToast(apiMsg, "error");
          else showToast(t("common.error"), "error");
        }
        onError?.(err);
        return null;
      } finally {
        setBusyCount((c) => Math.max(0, c - 1));
        if (itemId) {
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });
        }
      }
    },
    [token, serverUrl, signOut, showToast, t]
  );

  return {
    run,
    busy: busyCount > 0,
    isPending,
  };
}
