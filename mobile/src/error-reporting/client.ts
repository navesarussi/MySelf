import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getAppVersion } from "../version";

const QUEUE_KEY = "myself:error_report_queue";
const MAX_QUEUE = 50;
const FLUSH_DELAY_MS = 1500;

export type ClientErrorInput = {
  message: string;
  name?: string;
  stack?: string | null;
  screen?: string;
  route?: string;
  userAction?: string;
  httpStatus?: number;
  integration?: string;
  upstreamBody?: unknown;
};

type QueuedReport = ClientErrorInput & {
  appVersion: string;
  platform: string;
  source: "mobile-ios" | "web";
  queuedAt: string;
};

type ReportingConfig = {
  serverUrl: string;
  token?: string;
};

let config: ReportingConfig | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function errorSource(): "mobile-ios" | "web" {
  if (Platform.OS === "ios") return "mobile-ios";
  return "web";
}

function shouldSkipClientReport(input: ClientErrorInput): boolean {
  if (input.httpStatus === 401) return true;
  const msg = input.message.toLowerCase();
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("aborted") ||
    msg.includes("no_server") ||
    input.message === "not_connected" ||
    input.message.startsWith("token_refresh_failed")
  );
}

export function setErrorReportingConfig(next: ReportingConfig | null): void {
  config = next;
  if (next) scheduleFlush(0);
}

async function readQueue(): Promise<QueuedReport[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedReport[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  } catch {
    // ignore persistence failures
  }
}

export function reportClientError(input: ClientErrorInput): void {
  if (shouldSkipClientReport(input)) return;

  const item: QueuedReport = {
    ...input,
    appVersion: getAppVersion(),
    platform: Platform.OS,
    source: errorSource(),
    queuedAt: new Date().toISOString(),
  };

  void (async () => {
    const queue = await readQueue();
    queue.push(item);
    await writeQueue(queue);
    scheduleFlush();
  })();
}

function scheduleFlush(delay = FLUSH_DELAY_MS): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, delay);
}

export async function flushQueue(): Promise<void> {
  if (flushing || !config?.serverUrl) return;
  flushing = true;
  try {
    const queue = await readQueue();
    if (!queue.length) return;

    const remaining: QueuedReport[] = [];
    for (const item of queue) {
      try {
        const res = await fetch(`${config.serverUrl}/api/v1/client-errors`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
          },
          body: JSON.stringify(item),
        });
        if (!res.ok && res.status !== 429) {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }
    await writeQueue(remaining);
  } finally {
    flushing = false;
  }
}

type GlobalWithErrorUtils = typeof globalThis & {
  ErrorUtils?: {
    getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
    setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
  };
};

export function installGlobalErrorHandlers(): void {
  const g = globalThis as GlobalWithErrorUtils;
  const errorUtils = g.ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      reportClientError({
        name: error.name,
        message: error.message,
        stack: error.stack ?? null,
        userAction: isFatal ? "fatal_js_error" : "global_js_error",
      });
      previous?.(error, isFatal);
    });
  }

  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.addEventListener("error", (event) => {
      reportClientError({
        name: event.error instanceof Error ? event.error.name : "Error",
        message: event.message || "window_error",
        stack: event.error instanceof Error ? event.error.stack : null,
        userAction: "window_error",
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      reportClientError({
        name: reason instanceof Error ? reason.name : "UnhandledPromiseRejection",
        message: reason instanceof Error ? reason.message : String(reason ?? "unhandled_rejection"),
        stack: reason instanceof Error ? reason.stack : null,
        userAction: "unhandled_rejection",
      });
    });
  }
}
