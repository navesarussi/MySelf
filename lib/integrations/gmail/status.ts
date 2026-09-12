import { GOOGLE_GMAIL_PROVIDER, GOOGLE_GMAIL_SCOPE } from "../google-config";
import { getIntegrationToken } from "../tokens";
import { getValidGmailAccessToken } from "./client";

export type GmailConnectionStatus = {
  connected: boolean;
  working: boolean;
  error?: string;
  connectedAt?: string | null;
};

export async function hasGmailScope(accessToken: string): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
  );
  if (!res.ok) return false;
  const data = (await res.json()) as { scope?: string; error?: string };
  if (data.error) return false;
  return scopeIncludesGmail(data.scope ?? "");
}

export function scopeIncludesGmail(scope: string): boolean {
  return scope.includes("gmail.readonly") || scope.includes(GOOGLE_GMAIL_SCOPE);
}

/** Classify Gmail API HTTP errors (scope alone is not enough — API may be disabled). */
export function classifyGmailApiError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (status === 403 && (lower.includes("has not been used") || lower.includes("disabled") || lower.includes("accessnotconfigured"))) {
    return "gmail_api_disabled";
  }
  if (status === 403) return "gmail_forbidden";
  if (status === 401) return "gmail_unauthorized";
  return `gmail_fetch_failed:${status}`;
}

export async function probeGmailApi(accessToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (res.ok) return { ok: true };
  const body = await res.text();
  return { ok: false, error: classifyGmailApiError(res.status, body) };
}

export async function getGmailConnectionStatus(): Promise<GmailConnectionStatus> {
  const row = await getIntegrationToken(GOOGLE_GMAIL_PROVIDER);
  if (!row) return { connected: false, working: false };

  try {
    const accessToken = await getValidGmailAccessToken();
    const scoped = await hasGmailScope(accessToken);
    if (!scoped) {
      return {
        connected: true,
        working: false,
        error: "missing_gmail_scope",
        connectedAt: row.connected_at ?? null,
      };
    }

    const probe = await probeGmailApi(accessToken);
    if (!probe.ok) {
      return {
        connected: true,
        working: false,
        error: probe.error,
        connectedAt: row.connected_at ?? null,
      };
    }

    return {
      connected: true,
      working: true,
      connectedAt: row.connected_at ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "gmail_check_failed";
    return {
      connected: true,
      working: false,
      error: message,
      connectedAt: row.connected_at ?? null,
    };
  }
}
