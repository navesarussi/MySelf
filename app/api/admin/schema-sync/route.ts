import { NextRequest, NextResponse } from "next/server";
import { ensureAgentWhatsAppDedupSchema } from "@/lib/db-admin";

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return false;
  const secrets = [process.env.CRON_SECRET, process.env.TRADING_CRON_SECRET].filter(
    (s): s is string => Boolean(s)
  );
  return secrets.some((s) => s === token);
}

/** Cron/manual: apply pending idempotent schema fixes on production Postgres. */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const whatsappDedup = await ensureAgentWhatsAppDedupSchema();
  return NextResponse.json({
    ok: whatsappDedup.ok,
    whatsapp_dedup: whatsappDedup,
  });
}
