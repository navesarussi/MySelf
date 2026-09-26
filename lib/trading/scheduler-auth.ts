import { bearerToken, isTradingCronAuthorized } from "@/lib/api/cron-auth";
import { getSupabase } from "@/lib/supabase";

/**
 * Scheduler auth for the trading ticks: Vercel/GitHub secrets, or a token stored in myself.trading_cron_tokens
 * (RLS, service-role only). The DB token exists because the scheduler is Supabase pg_cron — Vercel Hobby crons
 * are daily-only and GitHub's 15-minute schedule drifted by hours (the main tick last ran 3h late on 2026-09-26).
 */
export async function isSchedulerAuthorized(req: { headers: { get(name: string): string | null } }): Promise<boolean> {
  if (isTradingCronAuthorized(req)) return true;
  const token = bearerToken(req.headers.get("authorization"));
  if (!token || token.length < 32) return false;
  const { data } = await getSupabase().from("trading_cron_tokens").select("token").eq("token", token).maybeSingle();
  return Boolean(data);
}
