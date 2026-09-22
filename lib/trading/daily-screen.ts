import { getSupabase } from "@/lib/supabase";
import { mapWithConcurrency } from "@/lib/concurrency";
import { isCrypto } from "./config";
import { evaluateEligibility } from "./learning";
import { fetchBidAskSpreadPct, type BarCache } from "./market-data";
import { getClosedTrades, logEvent, toJournalTrade, type UniverseRow } from "./store";
import { barsFor, iso, toSym, type TickSummary } from "./tick-context";
import { bucketId, screenFailures, screenMetricsAt } from "./universe";

/**
 * Stage 3 — the daily liquidity/volatility screen and the eligibility gate that
 * follows from it. Split out of engine.ts.
 */

/** Market-data fetches per symbol; each is one provider request plus one UPDATE. */
const SCREEN_CONCURRENCY = 6;

export async function dailyScreen(universe: UniverseRow[], cache: BarCache, now: number, summary: TickSummary) {
  const sb = getSupabase();
  // One symbol at a time meant ~150 round trips in series on a daily run. Each
  // symbol is independent — it reads its own bars and writes its own row — so
  // the only reason to serialise was that the loop was written that way.
  await mapWithConcurrency(universe, SCREEN_CONCURRENCY, async (u) => {
    const sym = toSym(u);
    try {
      const daily = await barsFor(cache, sym, "1d");
      const spread = isCrypto(sym.asset_class) ? await fetchBidAskSpreadPct(sym.provider_symbol) : null;
      const m = screenMetricsAt(daily, daily.length - 1, spread);
      if (!m) return;
      // Typical stop ≈ 1.5 × daily ATR — the spread must be tiny relative to it.
      const failures = screenFailures(m, sym.asset_class, 1.5 * m.atr_pct);
      await sb
        .from("trading_universe")
        .update({ screen_passed: failures.length === 0, screen_failures: failures, bucket_id: bucketId(sym.asset_class, m), metrics: m, last_screened_at: iso(now), updated_at: iso(now) })
        .eq("symbol", u.symbol);
      u.screen_passed = failures.length === 0;
      u.bucket_id = bucketId(sym.asset_class, m);
    } catch (err) {
      summary.errors.push(`screen ${u.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  const decisions = evaluateEligibility({
    universe: universe.map((u) => ({ symbol: u.symbol, bucket_id: u.bucket_id, eligibility: u.eligibility, eligibility_changed_at: u.eligibility_changed_at ? Date.parse(u.eligibility_changed_at) : null })),
    trades: (await getClosedTrades()).map(toJournalTrade),
    now,
  });
  for (const d of decisions) {
    await sb.from("trading_universe").update({ eligibility: d.to, eligibility_changed_at: iso(now), eligibility_note: d.reason, updated_at: iso(now) }).eq("symbol", d.symbol);
    const u = universe.find((x) => x.symbol === d.symbol);
    if (u) {
      u.eligibility = d.to;
      u.eligibility_changed_at = iso(now);
    }
    await logEvent({ kind: "ELIGIBILITY", symbol: d.symbol, severity: "warn", message: `${d.symbol}: ${d.from} → ${d.to} (${d.reason})`, push: true });
  }
}
