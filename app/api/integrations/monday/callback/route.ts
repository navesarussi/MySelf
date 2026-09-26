import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeMondayCode,
  fetchMondayAccount,
} from "@/lib/integrations/task-sources/monday/client";
import { MONDAY_PROVIDER } from "@/lib/integrations/monday-config";
import { getIntegrationToken, saveIntegrationToken } from "@/lib/integrations/tokens";
import { consumeOAuthNext, consumeOAuthState } from "@/lib/integrations/oauth-state";
import { redirectToAppOrNext } from "@/lib/integrations/oauth-redirect";
import { setFlashCookie } from "@/lib/flash";
import { oauthStateAccount } from "@/lib/integrations/oauth-state-token";
import { runAsUser } from "@/lib/db/user-context";
import { withRouteHandler } from "@/lib/api/with-route-handler";

const APP_REDIRECT_COOKIE = "monday_oauth_app_redirect";


export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const jar = await cookies();
  const error = url.searchParams.get("error");
  const next = await consumeOAuthNext("monday");

  if (error) {
    setFlashCookie(jar, "Monday connection cancelled", "error");
    return redirectToAppOrNext({ jar, origin: url.origin, next, appRedirectCookie: APP_REDIRECT_COOKIE });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState("monday", state))) {
    setFlashCookie(jar, "Invalid OAuth state — try again", "error");
    return redirectToAppOrNext({ jar, origin: url.origin, next, appRedirectCookie: APP_REDIRECT_COOKIE });
  }
  const owner = await oauthStateAccount(state);
  if (!owner) {
    setFlashCookie(jar, "Invalid OAuth state — try again", "error");
    return redirectToAppOrNext({ jar, origin: url.origin, next, appRedirectCookie: APP_REDIRECT_COOKIE });
  }

  return runAsUser(owner, async () => {
    try {
      const tokens = await exchangeMondayCode(code);
      const account = await fetchMondayAccount(tokens.access_token);
      const existing = await getIntegrationToken(MONDAY_PROVIDER, account.id);
      const prev = existing?.settings ?? {};

      await saveIntegrationToken({
        provider: MONDAY_PROVIDER,
        account_key: account.id,
        access_token: tokens.access_token,
        refresh_token: null,
        expires_at: null,
        settings: {
          selected_list_ids: (prev.selected_list_ids as string[] | undefined) ?? [],
          pull_completed: prev.pull_completed ?? "none",
          account_name: account.name,
          account_slug: account.slug,
          ...(tokens.scope ? { oauth_scope: tokens.scope } : {}),
        },
      });

      setFlashCookie(jar, "Monday connected — select boards to sync");
      return redirectToAppOrNext({ jar, origin: url.origin, next, appRedirectCookie: APP_REDIRECT_COOKIE });
    } catch {
      setFlashCookie(jar, "Monday connection failed", "error");
      return redirectToAppOrNext({ jar, origin: url.origin, next, appRedirectCookie: APP_REDIRECT_COOKIE });
    }
  });
});
