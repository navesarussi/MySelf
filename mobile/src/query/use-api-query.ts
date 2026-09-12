import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../session";
import { ApiError, type ApiConfig } from "../api/client";

export type ApiQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
};

/**
 * Session-aware TanStack query wrapper.
 * Prevents full-screen spinners when cached data already exists.
 * Automatically triggers signOut on 401.
 */
export function useApiQuery<T>(
  queryKey: readonly unknown[],
  fetcher: (config: ApiConfig) => Promise<T>,
  options?: ApiQueryOptions
) {
  const { token, serverUrl, signOut } = useSession();
  const sessionReady = Boolean(token && serverUrl);
  const isEnabled = (options?.enabled ?? true) && sessionReady;

  const queryFn = useCallback(async () => {
    if (!token || !serverUrl) throw new ApiError(401, "unauthorized");
    try {
      return await fetcher({ token, serverUrl });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
      }
      throw err;
    }
  }, [token, serverUrl, fetcher, signOut]);

  const query = useQuery<T, Error>({
    queryKey,
    queryFn,
    enabled: isEnabled,
    staleTime: options?.staleTime,
  });

  const refresh = useCallback(async () => {
    const res = await query.refetch();
    return res.data;
  }, [query]);

  const errorMessage = query.error
    ? query.error instanceof Error
      ? query.error.message
      : "error"
    : null;

  return {
    data: query.data ?? null,
    loading: query.isPending && query.data === undefined,
    isFetching: query.isFetching,
    error: errorMessage,
    refresh,
    refetch: query.refetch,
  };
}
