import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/resources";
import { ApiError, type ApiConfig } from "../api/client";
import { useSession } from "../session";
import { queryKeys } from "./keys";
import type { TradingEquitySnapshot } from "@/lib/trading/types-client";

export const TRADING_EQUITY_POLL_MS = 5000;
export const TRADING_EQUITY_STALE_MS = 2000;

export async function fetchTradingEquity(config: ApiConfig): Promise<TradingEquitySnapshot | null> {
  try {
    return await api.tradingEquity(config);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return null;
    throw err;
  }
}

/**
 * Canonical live equity query — Home tile and Trading screen read the same cache.
 * Polls every 5s while foregrounded; keeps the last value during background refetches.
 */
export function useTradingEquity() {
  const { token, serverUrl, signOut } = useSession();
  const sessionReady = Boolean(token && serverUrl);
  const [appState, setAppState] = useState(AppState.currentState);
  const isForeground = appState === "active";

  useEffect(() => {
    const sub = AppState.addEventListener("change", setAppState);
    return () => sub.remove();
  }, []);

  const queryFn = useCallback(async () => {
    if (!token || !serverUrl) throw new ApiError(401, "unauthorized");
    try {
      return await fetchTradingEquity({ token, serverUrl });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
      }
      throw err;
    }
  }, [token, serverUrl, signOut]);

  const query = useQuery<TradingEquitySnapshot | null, Error>({
    queryKey: queryKeys.tradingEquity,
    queryFn,
    enabled: sessionReady,
    staleTime: TRADING_EQUITY_STALE_MS,
    refetchInterval: isForeground ? TRADING_EQUITY_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });

  const refresh = useCallback(async () => {
    const res = await query.refetch();
    return res.data ?? null;
  }, [query]);

  const errorMessage = query.error
    ? query.error instanceof Error
      ? query.error.message
      : "error"
    : null;

  return {
    data: query.data ?? null,
    visible: query.data != null,
    loading: query.isPending && query.data === undefined,
    isFetching: query.isFetching,
    dataUpdatedAt: query.dataUpdatedAt,
    error: errorMessage,
    refresh,
  };
}
