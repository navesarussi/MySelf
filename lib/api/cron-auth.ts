import { safeEqual } from "@/lib/auth";

/**
 * Scheduler auth for the cron endpoints (Vercel Cron, GitHub Actions, pg_cron).
 *
 * One implementation because there were eight, each comparing the header with
 * `===`, which returns as soon as two bytes differ and so leaks how much of the
 * secret was right. `safeEqual` folds the length difference in and always walks
 * the longer string; it is hand-rolled rather than `node:crypto` because this
 * also runs in the Edge runtime (proxy.ts).
 */

export function bearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

/** True when the request carries a bearer token matching any configured secret. */
export function matchesAnySecret(
  authHeader: string | null | undefined,
  secrets: (string | undefined | null)[]
): boolean {
  const token = bearerToken(authHeader);
  if (!token) return false;
  // Not short-circuited: every configured secret is compared so the number of
  // comparisons does not depend on which one matched.
  let ok = false;
  for (const secret of secrets) {
    const trimmed = secret?.trim();
    if (!trimmed) continue;
    if (safeEqual(token, trimmed)) ok = true;
  }
  return ok;
}

/** The shared `CRON_SECRET` gate used by the scheduled endpoints. */
export function isCronAuthorized(req: { headers: { get(name: string): string | null } }): boolean {
  return matchesAnySecret(req.headers.get("authorization"), [process.env.CRON_SECRET]);
}

/** Trading ticks accept their own secret as well as the shared one. */
export function isTradingCronAuthorized(req: { headers: { get(name: string): string | null } }): boolean {
  return matchesAnySecret(req.headers.get("authorization"), [
    process.env.TRADING_CRON_SECRET,
    process.env.CRON_SECRET,
  ]);
}
