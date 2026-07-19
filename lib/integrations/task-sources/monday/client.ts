import { mondayRedirectUri } from "../../monday-config";

export { mondayRedirectUri };
export { fetchMondayAccount, fetchMondayBoards, fetchAssignedOpenItems } from "./fetch";
export {
  getMondayAccessToken,
  completeByExternalId,
  reopenByExternalId,
} from "./status";

export function mondayAuthUrl(state: string): string {
  // Omit `scope` so Monday uses the scopes configured on the app.
  // Requesting scopes not enabled in Developer Center → invalid_scope.
  const params = new URLSearchParams({
    client_id: process.env.MONDAY_CLIENT_ID!,
    redirect_uri: mondayRedirectUri(),
    state,
    force_install_if_needed: "true",
  });
  return `https://auth.monday.com/oauth2/authorize?${params}`;
}

export async function exchangeMondayCode(code: string) {
  const res = await fetch("https://auth.monday.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.MONDAY_CLIENT_ID!,
      client_secret: process.env.MONDAY_CLIENT_SECRET!,
      redirect_uri: mondayRedirectUri(),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`token_exchange_failed:${res.status}:${body.slice(0, 300)}`);
  }
  return res.json() as Promise<{ access_token: string; token_type?: string; scope?: string }>;
}
