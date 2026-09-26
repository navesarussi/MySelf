import { getSupabase } from "@/lib/supabase";
import type { DedupeDecision, ErrorReportPayload } from "./types";
import { isNoiseError } from "./noise";

export const DEDUPE_WINDOW_MS = 30 * 60 * 1000;
export const HOURLY_SEND_CAP = 20;

export type DedupeStore = {
  upsert: (input: {
    fingerprint: string;
    payload: ErrorReportPayload;
    now: Date;
    noisy: boolean;
  }) => Promise<DedupeDecision>;
};

export function evaluateDedupe(input: {
  fingerprint: string;
  now: Date;
  existing?: {
    count: number;
    first_seen: string;
    last_sent_at: string | null;
  } | null;
  hourlySent: number;
  noisy: boolean;
  forceSend?: boolean;
}): DedupeDecision {
  const firstSeen = input.existing?.first_seen ?? input.now.toISOString();
  const occurrenceCount = (input.existing?.count ?? 0) + 1;

  if (input.forceSend) {
    return {
      fingerprint: input.fingerprint,
      shouldSend: true,
      occurrenceCount,
      firstSeen,
    };
  }

  if (input.noisy) {
    return {
      fingerprint: input.fingerprint,
      shouldSend: false,
      occurrenceCount,
      firstSeen,
      skipReason: "noise",
    };
  }

  if (input.hourlySent >= HOURLY_SEND_CAP) {
    return {
      fingerprint: input.fingerprint,
      shouldSend: false,
      occurrenceCount,
      firstSeen,
      skipReason: "hourly_cap",
    };
  }

  const lastSentAt = input.existing?.last_sent_at ? Date.parse(input.existing.last_sent_at) : 0;
  if (lastSentAt && input.now.getTime() - lastSentAt < DEDUPE_WINDOW_MS) {
    return {
      fingerprint: input.fingerprint,
      shouldSend: false,
      occurrenceCount,
      firstSeen,
      skipReason: "dedupe_window",
    };
  }

  return {
    fingerprint: input.fingerprint,
    shouldSend: true,
    occurrenceCount,
    firstSeen,
  };
}

export async function persistAndDecide(input: {
  fingerprint: string;
  payload: ErrorReportPayload;
  noisy: boolean;
  forceSend?: boolean;
  now?: Date;
}): Promise<DedupeDecision> {
  const now = input.now ?? new Date();
  const db = getSupabase();

  const { data: existing } = await db
    .from("error_reports")
    .select("count, first_seen, last_sent_at")
    .eq("fingerprint", input.fingerprint)
    .maybeSingle();

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { count: hourlySent } = await db
    .from("error_reports")
    .select("*", { count: "exact", head: true })
    .gte("last_sent_at", hourAgo);

  const decision = evaluateDedupe({
    fingerprint: input.fingerprint,
    now,
    existing,
    hourlySent: hourlySent ?? 0,
    noisy: input.noisy,
    forceSend: input.forceSend,
  });

  const row = {
    fingerprint: input.fingerprint,
    count: decision.occurrenceCount,
    first_seen: decision.firstSeen,
    last_seen: now.toISOString(),
    last_payload: input.payload,
    ...(decision.shouldSend ? { last_sent_at: now.toISOString() } : {}),
  };

  await db.from("error_reports").upsert(row, { onConflict: "fingerprint" });

  return decision;
}

export function isNoisyReport(error: unknown, payload: ErrorReportPayload): boolean {
  return isNoiseError({
    error,
    httpStatus: payload.httpStatus ?? undefined,
    message: payload.message,
  });
}
