/** Validates deep-link targets for the mobile OAuth hand-off. */

const ALLOWED_PROTOCOLS = new Set(["myself:", "exp:", "exps:", "exp+https:", "exp+http:"]);

export function isAllowedAppRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "myself:") return parsed.hostname === "auth";
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function appendTokenToRedirect(base: string, token: string): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}
