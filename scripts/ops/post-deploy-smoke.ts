/**
 * Post-deploy smoke test — run by .github/workflows/post-deploy-smoke.yml after
 * every production deploy.
 *
 * Mints a short-lived session token for the primary account, calls the app's
 * key read endpoints, and fails when any answers non-200 or reports a
 * non-empty `degraded` list. On failure it pushes an alert to the owner through
 * POST /api/v1/ops/alert (push, falling back to WhatsApp).
 *
 * Env: MYSELF_API_URL, AUTH_SECRET, SMOKE_EMAIL; optional GITHUB_SHA,
 * SMOKE_BASE_URL (overrides MYSELF_API_URL, e.g. to hit one deployment).
 */
import { makeSessionToken } from "../../lib/auth";
import { evaluateSmokeResponse, formatSmokeAlert, smokeEndpoints, type SmokeResult } from "../../lib/ops/smoke";

const TIMEOUT_MS = 30_000;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name} — set it as a repository secret.`);
    process.exit(1);
  }
  return value;
}

async function check(base: string, token: string, path: string): Promise<SmokeResult> {
  const started = Date.now();
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    return { path, status: res.status, failure: evaluateSmokeResponse(res.status, text), ms: Date.now() - started };
  } catch (err) {
    const failure = err instanceof Error && err.name === "TimeoutError" ? `timeout_${TIMEOUT_MS / 1000}s` : `fetch_error: ${String(err)}`;
    return { path, status: 0, failure, ms: Date.now() - started };
  }
}

async function alert(base: string, token: string, failures: SmokeResult[]) {
  const sha = process.env.GITHUB_SHA;
  const payload = { ...formatSmokeAlert(failures, sha), ref: `smoke-${sha?.slice(0, 7) ?? Date.now()}` };
  try {
    const res = await fetch(`${base}/api/v1/ops/alert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    console.log(`alert: HTTP ${res.status} ${await res.text()}`);
  } catch (err) {
    // The deploy may be too broken to relay its own alert; the failed workflow run still emails.
    console.error("alert: could not reach /api/v1/ops/alert", err);
  }
}

async function main() {
  const base = (process.env.SMOKE_BASE_URL?.trim() || requireEnv("MYSELF_API_URL")).replace(/\/+$/, "");
  const token = await makeSessionToken(requireEnv("AUTH_SECRET"), requireEnv("SMOKE_EMAIL"), { ttlSeconds: 600 });

  const results = await Promise.all(smokeEndpoints().map((path) => check(base, token, path)));
  for (const r of results) {
    console.log(`${r.failure ? "FAIL" : "ok  "} ${r.status} ${String(r.ms).padStart(5)}ms ${r.path}${r.failure ? ` — ${r.failure}` : ""}`);
  }

  const failures = results.filter((r) => r.failure);
  if (failures.length === 0) return;
  await alert(base, token, failures);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
