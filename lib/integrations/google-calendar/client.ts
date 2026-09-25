import { GOOGLE_CALENDAR_SCOPE, GOOGLE_LOGIN_SCOPES } from "../google-config";
import type { GoogleCalendarEvent, GoogleEventsListResponse } from "./types";

export function googleAuthUrl(state: string, mode: "login" | "calendar" = "calendar") {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: mode === "login" ? GOOGLE_LOGIN_SCOPES : GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function fetchGoogleUserEmail(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("userinfo_fetch_failed");
  const data = (await res.json()) as { email?: string };
  if (!data.email) throw new Error("userinfo_missing_email");
  return data.email;
}

export async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
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

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("token_refresh_failed");
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

type FetchRange = { timeMin?: string; timeMax?: string };

export async function fetchPrimaryEvents(accessToken: string, range: FetchRange = {}) {
  const items: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
      showDeleted: "false",
    });
    if (range.timeMin) params.set("timeMin", range.timeMin);
    if (range.timeMax) params.set("timeMax", range.timeMax);
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`calendar_fetch_failed:${res.status}:${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as GoogleEventsListResponse;
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

/**
 * How far ahead recurring events are expanded. `singleEvents=true` with no
 * `timeMax` expands a series without an end date indefinitely: one weekly event
 * alone was stored through 2040 — 650 rows, 14% of the timeline. The sync drops
 * local rows Google no longer returns, so rows past the horizon clean
 * themselves up, and the window moves forward with each daily sync.
 */
export const FUTURE_HORIZON_YEARS = 2;

/** Recent events first (last 6 years up to the future horizon), then older history. */
export async function fetchAllPrimaryEvents(accessToken: string, now = new Date()) {
  const recentCutoff = new Date(now);
  recentCutoff.setFullYear(recentCutoff.getFullYear() - 6);
  const cutoffIso = recentCutoff.toISOString();
  const horizon = new Date(now);
  horizon.setFullYear(horizon.getFullYear() + FUTURE_HORIZON_YEARS);

  const recent = await fetchPrimaryEvents(accessToken, {
    timeMin: cutoffIso,
    timeMax: horizon.toISOString(),
  });
  const older = await fetchPrimaryEvents(accessToken, {
    timeMin: "1990-01-01T00:00:00Z",
    timeMax: cutoffIso,
  });

  const byId = new Map<string, GoogleCalendarEvent>();
  for (const event of [...recent, ...older]) {
    byId.set(event.id, event);
  }
  return [...byId.values()];
}
