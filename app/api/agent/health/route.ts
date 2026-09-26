import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api/cron-auth";
import { sendOpsAlert } from "@/lib/ops/alert";
import { runHealthProbes } from "@/lib/ops/health-probes";
import { formatHealthDigest } from "@/lib/ops/health-rules";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const maxDuration = 60;

/**
 * Daily dependency digest (Vercel cron, 03:00 UTC).
 *
 * Probes Gemini (credits / key), Alpaca (auth / account blocks), the WhatsApp
 * token, and every account's integration tokens, then sends one push listing
 * what is broken. Nothing is sent when everything is healthy — the old probe
 * WhatsApp'd the owner every morning regardless, which trained them to ignore it.
 */
export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const issues = await runHealthProbes();
  const digest = formatHealthDigest(issues);
  if (!digest) return NextResponse.json({ ok: true, issues });

  const alert = await sendOpsAlert({ ...digest, ref: "health-digest" }).catch((err) => {
    console.error("[agent/health] alert failed", err instanceof Error ? err.message : err);
    return null;
  });
  console.warn("[agent/health] issues", JSON.stringify(issues));
  return NextResponse.json({ ok: false, issues, alert });
});
