/**
 * Compares the mobile app's runtime version (sent as `X-App-Version`) against
 * a minimum required version, for endpoints that changed payload shape in a
 * way an older client cannot safely handle.
 *
 * Needed because native builds lag behind deploys: a TestFlight/Play Store
 * build already installed keeps running its old code until the user updates,
 * even after the API and store listing move on. The Expo web export doesn't
 * have this gap — `npm run build` re-exports it fresh on every deploy — so
 * this only matters for native.
 */

type Semver = [number, number, number];

function parseSemver(raw: string | null | undefined): Semver | null {
  if (!raw) return null;
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: Semver, b: Semver): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * True only when the client identified itself with a parseable version that
 * is >= `min`. An absent or malformed header is treated as "unknown, assume
 * old" — the safe direction for a compatibility gate — not as an error.
 */
export function clientVersionAtLeast(
  header: string | null | undefined,
  min: string
): boolean {
  const clientVersion = parseSemver(header);
  const minVersion = parseSemver(min);
  if (!clientVersion || !minVersion) return false;
  return compareSemver(clientVersion, minVersion) >= 0;
}
