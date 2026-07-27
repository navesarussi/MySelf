import { refreshAccessToken } from "../google-calendar/client";
import { GOOGLE_GMAIL_PROVIDER, GOOGLE_GMAIL_SCOPE } from "../google-config";
import { getIntegrationToken, saveIntegrationToken } from "../tokens";
import { compactEmailFromMessage, extractEmailBody } from "./decode";
import type { CompactEmail, EmailDetail, GmailListResponse, GmailMessage } from "./types";

export function gmailRedirectUri(): string {
  if (process.env.GOOGLE_GMAIL_REDIRECT_URI) {
    return process.env.GOOGLE_GMAIL_REDIRECT_URI;
  }
  if (process.env.VERCEL_ENV === "production") {
    return "https://myselfapp.xyz/api/integrations/gmail/callback";
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/integrations/gmail/callback`;
  }
  return "http://localhost:3000/api/integrations/gmail/callback";
}

export function gmailAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: gmailRedirectUri(),
    response_type: "code",
    scope: GOOGLE_GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGmailCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: gmailRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("token_exchange_failed");
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

export async function getValidGmailAccessToken(): Promise<string> {
  const row = await getIntegrationToken(GOOGLE_GMAIL_PROVIDER);
  if (!row) throw new Error("gmail_not_connected");

  if (row.expires_at) {
    const expires = new Date(row.expires_at).getTime();
    if (Date.now() < expires - 60_000) return row.access_token;
  }

  if (!row.refresh_token) throw new Error("missing_refresh_token");
  const refreshed = await refreshAccessToken(row.refresh_token);
  const expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await saveIntegrationToken({
    provider: GOOGLE_GMAIL_PROVIDER,
    access_token: refreshed.access_token,
    refresh_token: row.refresh_token,
    expires_at,
  });
  return refreshed.access_token;
}

async function gmailFetch<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    return gmailFetch(path, accessToken);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`gmail_fetch_failed:${res.status}:${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function listGmailMessages(
  accessToken: string,
  opts: { q?: string; limit?: number } = {}
): Promise<CompactEmail[]> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 20);
  const params = new URLSearchParams({ maxResults: String(limit) });
  if (opts.q?.trim()) params.set("q", opts.q.trim());

  const listed = await gmailFetch<GmailListResponse>(`/messages?${params}`, accessToken);
  const ids = (listed.messages ?? []).slice(0, limit);
  if (!ids.length) return [];

  const details = await Promise.all(
    ids.map((m) =>
      gmailFetch<GmailMessage>(
        `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        accessToken
      )
    )
  );
  return details.map(compactEmailFromMessage);
}

export async function readGmailMessage(accessToken: string, id: string): Promise<EmailDetail> {
  const msg = await gmailFetch<GmailMessage>(`/messages/${id}?format=full`, accessToken);
  const compact = compactEmailFromMessage(msg);
  const body = extractEmailBody(msg.payload);
  return { ...compact, body: body.slice(0, 8000) };
}

export async function isGmailConnected() {
  const row = await getIntegrationToken(GOOGLE_GMAIL_PROVIDER);
  return row != null;
}
