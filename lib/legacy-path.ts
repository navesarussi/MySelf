/** Base path for the preserved Next.js website (FR-WEB-PRIMARY-01). */
export const LEGACY_BASE = "/legacy";

/** Prefix a site path with /legacy. `"/"` → `/legacy`, `"/tasks"` → `/legacy/tasks`. */
export function legacyPath(path: string): string {
  if (!path || path === "/") return LEGACY_BASE;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${LEGACY_BASE}${normalized}`;
}
