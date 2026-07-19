export const MONDAY_PROVIDER = "monday";

export const MONDAY_SCOPES = [
  "me:read",
  "account:read",
  "boards:read",
  "boards:write",
  "workspaces:read",
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
