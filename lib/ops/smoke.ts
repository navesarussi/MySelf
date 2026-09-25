/**
 * Post-deploy smoke test rules (`scripts/ops/post-deploy-smoke.ts`).
 *
 * A read endpoint passes when it answers 200 with JSON and does not report a
 * `degraded` section. `/api/v1/home` returning `degraded: ["financeNet"]` on
 * every load for two days is the failure this exists to catch: the app still
 * rendered, so nobody noticed.
 */

export type SmokeResult = { path: string; status: number; failure: string | null; ms: number };

/** The month the finance plan endpoint is asked for, `YYYY-MM` in UTC. */
export function smokeMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function smokeEndpoints(now = new Date()): string[] {
  return [
    "/api/v1/home",
    "/api/v1/tasks",
    "/api/v1/habits",
    "/api/v1/goals",
    `/api/v1/finance/plan?month=${smokeMonth(now)}`,
  ];
}

/** Null when the response is healthy, otherwise a one-line reason. */
export function evaluateSmokeResponse(status: number, bodyText: string): string | null {
  if (status !== 200) return `http_${status}`;
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return "invalid_json";
  }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const degraded = (body as { degraded?: unknown }).degraded;
    if (Array.isArray(degraded) && degraded.length > 0) return `degraded: ${degraded.join(", ")}`;
  }
  return null;
}

export function formatSmokeAlert(
  failures: SmokeResult[],
  sha?: string
): { title: string; body: string } {
  const lines = failures.map((f) => `• ${f.path.split("?")[0]}: ${f.failure}`);
  if (sha) lines.push(`commit ${sha.slice(0, 7)}`);
  return { title: "🚨 MySelf — בדיקת smoke נכשלה אחרי דיפלוי", body: lines.join("\n") };
}
