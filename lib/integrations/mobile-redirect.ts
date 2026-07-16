/** Validates deep-link / web hand-off targets for OAuth mobile-redirect. */

const ALLOWED_PROTOCOLS = new Set(["myself:", "exp:", "exps:", "exp+https:", "exp+http:"]);

const ALLOWED_WEB_HOSTS = new Set(["myselfapp.xyz", "www.myselfapp.xyz", "localhost", "127.0.0.1"]);

function isLocalhostHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isAllowedWebHost(hostname: string): boolean {
  if (ALLOWED_WEB_HOSTS.has(hostname)) return true;
  // Vercel preview deployments
  if (hostname.endsWith(".vercel.app")) return true;
  return false;
}

/**
 * HTTPS (or http localhost) redirects back into the Expo web SPA on known hosts.
 * Blocks /api and /legacy — those are Next.js surfaces, not app deep links.
 */
function isAllowedWebAppRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!isAllowedWebHost(parsed.hostname)) return false;
    const path = parsed.pathname || "/";
    if (path.startsWith("/api") || path.startsWith("/legacy")) return false;
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:" && isLocalhostHost(parsed.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

export function isAllowedAppRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "myself:") return parsed.hostname === "auth";
    if (ALLOWED_PROTOCOLS.has(parsed.protocol)) return true;
    return isAllowedWebAppRedirect(url);
  } catch {
    return false;
  }
}

export function appendTokenToRedirect(base: string, token: string): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}
