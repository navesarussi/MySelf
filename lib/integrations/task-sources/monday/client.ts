import { MONDAY_SCOPES, mondayRedirectUri } from "../../monday-config";

export { mondayRedirectUri };
export { fetchMondayAccount, fetchMondayBoards, fetchAssignedOpenItems } from "./fetch";
export {
  getMondayAccessToken,
  completeByExternalId,
  reopenByExternalId,
} from "./status";

export function mondayAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MONDAY_CLIENT_ID!,
    redirect_uri: mondayRedirectUri(),
    state,
    scope: MONDAY_SCOPES,
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
