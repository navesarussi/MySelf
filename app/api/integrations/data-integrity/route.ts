import { NextRequest, NextResponse } from "next/server";
import { runDataIntegrityMaintenance } from "@/lib/db-maintenance";

function isCronRequest(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

/** Cron/manual cleanup for duplicate rows (complements migration 0015 constraints). */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDataIntegrityMaintenance();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "maintenance_failed";
    console.error("[data-integrity]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
