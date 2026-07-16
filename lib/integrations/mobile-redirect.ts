/** Validates deep-link / web hand-off targets for OAuth mobile-redirect. */

const ALLOWED_PROTOCOLS = new Set(["myself:", "exp:", "exps:", "exp+https:", "exp+http:"]);

const AUTH_PATH = "/auth";

function isLocalhostHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** HTTPS (or http localhost) same-app redirects ending at /auth for Expo web. */
function isAllowedWebAuthRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== AUTH_PATH && parsed.pathname !== `${AUTH_PATH}/`) return false;
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
    return isAllowedWebAuthRedirect(url);
  } catch {
    return false;
  }
}

export function appendTokenToRedirect(base: string, token: string): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}
