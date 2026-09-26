import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api/cron-auth";
import { dbError } from "@/lib/api/auth";
import { withRouteHandler } from "@/lib/api/with-route-handler";
import {
  DEFAULT_GATE_EVAL_DAYS,
  DEFAULT_GATE_EVAL_LIMIT,
  runNightlyPromotionGateEval,
} from "@/lib/trading/committee/gate-eval";

export const maxDuration = 60;

/**
 * Nightly promotion gate evaluation (log only).
 * Auth: Bearer CRON_SECRET (Vercel Cron, GitHub Actions, pg_cron, manual ops).
 * Does not read or mutate COMMITTEE_ENABLED / COMMITTEE_SHADOW.
 */
async function handleEval(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const days = Number(req.nextUrl.searchParams.get("days") ?? DEFAULT_GATE_EVAL_DAYS);
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? DEFAULT_GATE_EVAL_LIMIT);

  try {
    const result = await runNightlyPromotionGateEval({
      days: Number.isFinite(days) && days >= 0 ? days : DEFAULT_GATE_EVAL_DAYS,
      limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_GATE_EVAL_LIMIT,
    });

    return NextResponse.json({
      ok: true,
      eval_day: result.record.eval_day,
      verdict: result.record.verdict,
      reasons: result.record.reasons,
      metrics: result.record.metrics,
      criteria: result.record.criteria,
      consecutive_pass_days: result.consecutive_pass_days,
      persisted: result.persisted,
      window_since: result.record.window_since,
      window_limit: result.record.window_limit,
      generated_at: result.record.generated_at,
    });
  } catch {
    return dbError();
  }
}

/** Manual / external scheduler trigger. */
export const POST = withRouteHandler(async function POST(req: NextRequest) {
  return handleEval(req);
});

/** Vercel Cron-compatible GET (add to vercel.json when plan allows another daily slot). */
export const GET = withRouteHandler(async function GET(req: NextRequest) {
  return handleEval(req);
});
