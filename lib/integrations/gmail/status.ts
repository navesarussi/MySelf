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
