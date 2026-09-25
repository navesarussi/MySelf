import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { GEMINI_MODEL_ID } from "@/lib/ai-model";
import { forEachAccount } from "@/lib/db/accounts";
import { userDb } from "@/lib/db/user-db";
import { refreshAccessToken } from "@/lib/integrations/google-calendar/client";
import { alpaca, isAlpacaConfigured } from "@/lib/trading/broker/alpaca";
import { isWhatsAppConfigured } from "@/lib/whatsapp/client";
import type { IntegrationToken } from "@/lib/types";
import {
  alpacaAccountIssue,
  classifyAlpacaFailure,
  classifyGeminiFailure,
  integrationRowIssues,
  type HealthIssue,
} from "@/lib/ops/health-rules";

/**
 * Live dependency probes for the daily health digest. Each returns the issues
 * it found and never throws: one probe failing to run is itself an issue, not a
 * reason to skip the others.
 */

/** A real one-token generation: listing models succeeds with depleted credits. */
export async function probeGemini(): Promise<HealthIssue[]> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return [{ source: "gemini", detail: "missing_api_key" }];
  try {
    await generateText({ model: google(GEMINI_MODEL_ID), prompt: "ping", maxOutputTokens: 16, maxRetries: 1 });
    return [];
  } catch (err) {
    return [{ source: "gemini", detail: classifyGeminiFailure(err) }];
  }
}

/** Trading is optional: an unconfigured broker is not an outage. */
export async function probeAlpaca(): Promise<HealthIssue[]> {
  if (!isAlpacaConfigured()) return [];
  try {
    const issue = alpacaAccountIssue(await alpaca.account());
    return issue ? [{ source: "alpaca", detail: issue }] : [];
  } catch (err) {
    return [{ source: "alpaca", detail: classifyAlpacaFailure(err) }];
  }
}

/** Validates the access token by reading the phone number — sends nothing. */
export async function probeWhatsApp(): Promise<HealthIssue[]> {
  if (!isWhatsAppConfigured()) return [{ source: "whatsapp", detail: "not_configured" }];
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=id`,
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }, cache: "no-store" }
    );
    if (res.ok) return [];
    const data = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string } };
    const detail = data.error?.code === 190 ? "token_expired" : `http_${res.status}`;
    return [{ source: "whatsapp", detail }];
  } catch (err) {
    return [{ source: "whatsapp", detail: `error: ${err instanceof Error ? err.message : "failed"}` }];
  }
}

const GOOGLE_PROVIDERS = new Set(["google_calendar", "google_tasks", "google_gmail"]);

/** Stored-row issues plus a refresh of each distinct Google refresh token —
 *  a revoked grant only shows up when it is used. */
async function accountIntegrationIssues(): Promise<HealthIssue[]> {
  const { data, error } = await (await userDb())
    .from("integration_tokens")
    .select("provider, account_key, refresh_token, expires_at, sync_status, sync_started_at");
  if (error) return [{ source: "integrations", detail: `db_error: ${error.message}` }];
  const rows = (data ?? []) as IntegrationToken[];
  const issues = integrationRowIssues(rows);

  const probed = new Set<string>();
  for (const row of rows) {
    if (!GOOGLE_PROVIDERS.has(row.provider) || !row.refresh_token || probed.has(row.refresh_token)) continue;
    probed.add(row.refresh_token);
    try {
      await refreshAccessToken(row.refresh_token);
    } catch {
      issues.push({ source: "google", detail: "refresh_failed (reconnect in Settings)" });
    }
  }
  return issues;
}

export async function probeIntegrations(): Promise<HealthIssue[]> {
  const runs = await forEachAccount(accountIntegrationIssues);
  const multi = runs.length > 1;
  return runs.flatMap((run) => {
    const who = run.email.split("@")[0];
    if (!run.ok) return [{ source: `integrations${multi ? ` [${who}]` : ""}`, detail: `error: ${run.error}` }];
    return multi ? run.result.map((i) => ({ ...i, source: `${i.source} [${who}]` })) : run.result;
  });
}

export async function runHealthProbes(): Promise<HealthIssue[]> {
  const results = await Promise.all([probeGemini(), probeAlpaca(), probeWhatsApp(), probeIntegrations()]);
  return results.flat();
}
