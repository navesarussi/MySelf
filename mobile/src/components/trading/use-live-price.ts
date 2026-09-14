import { useEffect, useRef, useState } from "react";
import { api } from "../../api/resources";
import { useSession } from "../../session";

export type LivePrice = { price: number | null; at: number | null; direction: "up" | "down" | null; source: "stream" | "poll" | null };

const STREAM_BASE = "wss://data-stream.binance.vision/ws";
const POLL_MS = 2000;
const UI_THROTTLE_MS = 250;

/**
 * Live last-trade price. Crypto: Binance public trade stream (tick-by-tick, no key) with automatic reconnect and a
 * polling fallback; stocks: the server's Alpaca IEX last trade every 2 seconds (broker keys never reach the client).
 */
export function useLivePrice(symbol: string | null | undefined, assetClass: string | null | undefined, enabled = true): LivePrice {
  const { token, serverUrl } = useSession();
  const [state, setState] = useState<LivePrice>({ price: null, at: null, direction: null, source: null });
  const last = useRef<number | null>(null);

  useEffect(() => {
    setState({ price: null, at: null, direction: null, source: null });
    last.current = null;
    if (!enabled || !symbol || !assetClass) return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pending: { price: number; source: "stream" | "poll" } | null = null;
    let lastEmit = 0;

    const emit = (price: number, source: "stream" | "poll") => {
      pending = { price, source };
      const now = Date.now();
      if (now - lastEmit < UI_THROTTLE_MS) return;
      lastEmit = now;
      const prev = last.current;
      last.current = price;
      if (!cancelled) setState({ price, at: now, direction: prev === null || prev === price ? null : price > prev ? "up" : "down", source });
      pending = null;
    };
    const flush = setInterval(() => {
      if (pending) emit(pending.price, pending.source);
    }, UI_THROTTLE_MS);

    const poll = async () => {
      if (!token || !serverUrl) return;
      try {
        const res = await api.tradingPrice({ token, serverUrl }, symbol, assetClass === "STOCK" ? "STOCK" : "CRYPTO");
        if (res.price > 0) emit(res.price, "poll");
      } catch {
        // transient — next poll retries
      }
    };
    const startPolling = () => {
      if (pollTimer) return;
      void poll();
      pollTimer = setInterval(() => void poll(), POLL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    const connect = () => {
      if (cancelled) return;
      try {
        ws = new WebSocket(`${STREAM_BASE}/${symbol.toLowerCase()}usdt@trade`);
      } catch {
        startPolling();
        return;
      }
      ws.onopen = () => stopPolling();
      ws.onmessage = (ev) => {
        try {
          const p = Number((JSON.parse(String(ev.data)) as { p?: string }).p);
          if (p > 0) emit(p, "stream");
        } catch {
          // ignore malformed frames
        }
      };
      ws.onerror = () => startPolling();
      ws.onclose = () => {
        if (cancelled) return;
        startPolling();
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    if (assetClass === "STOCK") startPolling();
    else {
      startPolling(); // immediate first price while the socket connects
      connect();
    }
    return () => {
      cancelled = true;
      clearInterval(flush);
      stopPolling();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [symbol, assetClass, enabled, token, serverUrl]);

  return state;
}
