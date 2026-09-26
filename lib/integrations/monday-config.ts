export const MONDAY_PROVIDER = "monday";

/** Scopes the Monday app should have enabled in Developer Center (boards:write required for complete/reopen).
 * We omit `scope` on the authorize URL so Monday grants whatever the app config lists — requesting
 * scopes not toggled in Developer Center returns invalid_scope. Persisted oauth_scope from token
 * exchange is checked before writeback; missing boards:write → reconnect prompt. */
export const MONDAY_SCOPES = [
  "me:read",
  "account:read",
  "boards:read",
  "boards:write",
].join(" ");

export function mondayConfigured() {
  return Boolean(process.env.MONDAY_CLIENT_ID && process.env.MONDAY_CLIENT_SECRET);
}

export function mondayRedirectUri(): string {
  if (process.env.MONDAY_REDIRECT_URI) {
    return process.env.MONDAY_REDIRECT_URI;
  }
  if (process.env.VERCEL_ENV === "production") {
    return "https://myselfapp.xyz/api/integrations/monday/callback";
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/integrations/monday/callback`;
  }
  return "http://localhost:3000/api/integrations/monday/callback";
}
