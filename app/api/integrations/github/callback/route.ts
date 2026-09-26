import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeGithubCode,
  fetchGithubUser,
} from "@/lib/integrations/task-sources/github/client";
import { GITHUB_PROVIDER } from "@/lib/integrations/github-config";
import { getIntegrationToken, saveIntegrationToken } from "@/lib/integrations/tokens";
import { consumeOAuthNext, consumeOAuthState } from "@/lib/integrations/oauth-state";
import { redirectToAppOrNext } from "@/lib/integrations/oauth-redirect";
import { setFlashCookie } from "@/lib/flash";
import { oauthStateAccount } from "@/lib/integrations/oauth-state-token";
import { runAsUser } from "@/lib/db/user-context";
import { withRouteHandler } from "@/lib/api/with-route-handler";

const APP_REDIRECT_COOKIE = "github_oauth_app_redirect";


export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const jar = await cookies();
  const error = url.searchParams.get("error");
  const next = await consumeOAuthNext("github");

  if (error) {
    setFlashCookie(jar, "GitHub connection cancelled", "error");
    return redirectToAppOrNext({ jar, origin: url.origin, next, appRedirectCookie: APP_REDIRECT_COOKIE });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState("github", state))) {
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
      const tokens = await exchangeGithubCode(code);
      const user = await fetchGithubUser(tokens.access_token);
      const existing = await getIntegrationToken(GITHUB_PROVIDER);

      await saveIntegrationToken({
        provider: GITHUB_PROVIDER,
        access_token: tokens.access_token,
        refresh_token: null,
        expires_at: null,
        settings: {
          ...(existing?.settings ?? {}),
          account_name: user.login,
          account_login: user.login,
        },
      });

      setFlashCookie(jar, "GitHub connected", "success");
      return redirectToAppOrNext({ jar, origin: url.origin, next: next || "/settings", appRedirectCookie: APP_REDIRECT_COOKIE });
    } catch (err) {
      console.error("[github-callback]", err);
      setFlashCookie(jar, "GitHub connection failed", "error");
      return redirectToAppOrNext({ jar, origin: url.origin, next: next || "/settings", appRedirectCookie: APP_REDIRECT_COOKIE });
    }
  });
});
