export const GITHUB_PROVIDER = "github";

export function githubConfigured() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function githubRedirectUri(): string {
  if (process.env.GITHUB_REDIRECT_URI) return process.env.GITHUB_REDIRECT_URI;
  if (process.env.VERCEL_ENV === "production") {
    return "https://myselfapp.xyz/api/integrations/github/callback";
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/integrations/github/callback`;
  }
  return "http://localhost:3000/api/integrations/github/callback";
}

/** Private + public repos; read:org needed for organization repo listing. */
export const GITHUB_OAUTH_SCOPES = "repo read:user read:org";
