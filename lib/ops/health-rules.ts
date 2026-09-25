import { GEMINI_CREDITS_DEPLETED, mapGeminiError } from "@/lib/agent/gemini-errors";
import type { IntegrationToken } from "@/lib/types";

/**
 * Pure rules behind the daily health digest (`/api/agent/health`).
 *
 * The probes in `health-probes.ts` do the network calls; everything that
 * decides "is this broken, and how do we say so" lives here so it can be
 * tested without Gemini, Alpaca or a database.
 */

export type HealthIssue = { source: string; detail: string };

const DAY_MS = 24 * 60 * 60 * 1000;
/** A sync still "running" after this long died without writing its status. */
const STUCK_SYNC_MS = 2 * 60 * 60 * 1000;
/** Warn about a non-refreshable token this long before it expires. */
const EXPIRY_WARNING_MS = 3 * DAY_MS;

function errorText(err: unknown): string {
  if (err instanceof Error) {
    const extra = err as Error & { statusCode?: number; responseBody?: string };
    return [err.message, extra.statusCode, extra.responseBody].filter(Boolean).join(" ");
  }
  return String(err);
}

function short(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Gemini failures, by what the owner has to do about them. */
export function classifyGeminiFailure(err: unknown): string {
  if (mapGeminiError(err).message === GEMINI_CREDITS_DEPLETED) return "credits_depleted";
  const text = errorText(err);
  if (/\b(401|403)\b|api[_ ]?key|unauthenticated|permission[_ ]denied/i.test(text)) return "auth_failed";
  if (/\b429\b|quota|resource[_ ]exhausted/i.test(text)) return "quota_exhausted";
  return `error: ${short(text)}`;
}

/** `lib/trading/broker/alpaca.ts` throws `alpaca_<status>:<body>`. */
export function classifyAlpacaFailure(err: unknown): string {
  const text = errorText(err);
  const status = /alpaca_(\d{3})/.exec(text)?.[1];
  if (status === "401" || status === "403") return "auth_failed";
  if (status) return `http_${status}`;
  return `error: ${short(text)}`;
}

export function alpacaAccountIssue(account: { trading_blocked?: boolean; account_blocked?: boolean; status?: string }): string | null {
  if (account.account_blocked) return "account_blocked";
  if (account.trading_blocked) return "trading_blocked";
  if (account.status && account.status !== "ACTIVE") return `status_${account.status.toLowerCase()}`;
  return null;
}

type TokenRow = Pick<IntegrationToken, "provider" | "account_key" | "refresh_token" | "expires_at" | "sync_status" | "sync_started_at">;

/** What the stored integration rows alone say is wrong — no network. */
export function integrationRowIssues(rows: TokenRow[], now = new Date()): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const t = now.getTime();
  for (const row of rows) {
    const source = row.account_key ? `${row.provider} (${row.account_key})` : row.provider;
    if (row.sync_status === "failed") issues.push({ source, detail: "sync_failed" });
    const started = row.sync_started_at ? Date.parse(row.sync_started_at) : NaN;
    if (row.sync_status === "running" && t - started > STUCK_SYNC_MS) {
      issues.push({ source, detail: "sync_stuck" });
    }
    // A row with a refresh token renews itself; its expiry is not a problem.
    if (row.refresh_token || !row.expires_at) continue;
    const expires = Date.parse(row.expires_at);
    if (expires <= t) issues.push({ source, detail: "token_expired" });
    else if (expires - t < EXPIRY_WARNING_MS) issues.push({ source, detail: "token_expiring" });
  }
  return issues;
}

/** One push for the whole digest; null when there is nothing to say. */
export function formatHealthDigest(issues: HealthIssue[]): { title: string; body: string } | null {
  if (issues.length === 0) return null;
  const lines = issues.map((i) => `• ${i.source}: ${i.detail}`);
  return {
    title: `⚠️ MySelf — ${issues.length} ${issues.length === 1 ? "תקלה" : "תקלות"} בתלויות`,
    body: lines.join("\n"),
  };
}
