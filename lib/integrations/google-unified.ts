import {
  GOOGLE_GMAIL_PROVIDER,
  GOOGLE_PROVIDER,
  GOOGLE_TASKS_PROVIDER,
} from "./google-config";
import { getIntegrationToken, saveIntegrationToken } from "./tokens";

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

/** Persist one OAuth grant across calendar, tasks, and Gmail providers. */
export async function saveGoogleTokensToAllProviders(tokens: GoogleTokenResponse) {
  const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const providers = [GOOGLE_PROVIDER, GOOGLE_TASKS_PROVIDER, GOOGLE_GMAIL_PROVIDER];

  for (const provider of providers) {
    const existing = await getIntegrationToken(provider);
    const refreshToken = tokens.refresh_token ?? existing?.refresh_token;
    if (!refreshToken) continue;

    const settings =
      provider === GOOGLE_TASKS_PROVIDER
        ? (existing?.settings ?? { selected_list_ids: [], pull_completed: "none" })
        : existing?.settings;

    await saveIntegrationToken({
      provider,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      expires_at,
      last_sync_at: existing?.last_sync_at ?? null,
      settings,
    });
  }
}
