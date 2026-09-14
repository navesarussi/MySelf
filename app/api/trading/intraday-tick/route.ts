import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { runIntradayTick } from "@/lib/trading/intraday-engine";

export const maxDuration = 120;

/**
 * Scheduler auth: Vercel/GitHub secrets, or a token stored in myself.trading_cron_tokens (RLS, service-role only).
 * The DB token exists because the scheduler is Supabase pg_cron (Vercel Hobby crons are daily-only).
 */
async function isSchedulerAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  const secrets = [process.env.TRADING_CRON_SECRET, process.env.CRON_SECRET].filter((s): s is string => Boolean(s));
  if (secrets.includes(token)) return true;
  if (token.length < 32) return false;
  const { data } = await getSupabase().from("trading_cron_tokens").select("token").eq("token", token).maybeSingle();
  return Boolean(data);
}

/** Intraday (15m setup / 5m entry) tick — pg_cron job `trading-intraday-tick`, 1 minute after every 5m close (1-59/5). */
async function handle(req: NextRequest) {
  if (!(await isSchedulerAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runIntradayTick());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "intraday_tick_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
