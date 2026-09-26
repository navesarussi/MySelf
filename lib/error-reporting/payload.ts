import { APP_VERSION } from "@/lib/version";
import { computeFingerprint } from "./fingerprint";
import { redactUpstreamBody } from "./redact";
import type { ErrorReportPayload, ReportContext, ReportErrorInput } from "./types";

function coerceError(error: unknown): { name: string; message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "unknown_error",
      stack: error.stack ?? null,
    };
  }
  const message = String(error ?? "unknown_error");
  return { name: "Error", message, stack: null };
}

export function buildPayload(
  input: ReportErrorInput,
  meta?: { occurrenceCount?: number; firstSeen?: string; now?: Date }
): ErrorReportPayload {
  const ctx = input.context ?? {};
  const err = coerceError(input.error);
  const now = meta?.now ?? new Date();
  const route = ctx.route ?? ctx.path ?? null;
  const screen = ctx.screen ?? null;
  const fingerprint = computeFingerprint({
    source: input.source,
    message: err.message,
    route,
    screen,
    stack: err.stack,
  });

  return {
    source: input.source,
    appVersion: ctx.appVersion ?? APP_VERSION,
    gitSha: ctx.gitSha ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    environment: ctx.environment ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    route,
    screen,
    method: ctx.method ?? null,
    path: ctx.path ?? route,
    httpStatus: ctx.httpStatus ?? null,
    userAction: ctx.userAction ?? null,
    errorName: err.name,
    message: err.message,
    stack: err.stack,
    integration: ctx.integration ?? null,
    upstreamBody: redactUpstreamBody(ctx.upstreamBody),
    userId: ctx.userId ?? null,
    fingerprint,
    firstSeen: meta?.firstSeen ?? now.toISOString(),
    occurrenceCount: meta?.occurrenceCount ?? 1,
    timestamp: now.toISOString(),
    ...(ctx.test ? { test: true } : {}),
  };
}
