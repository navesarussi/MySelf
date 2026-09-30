import { getSupabase } from "@/lib/supabase";
import { MODEL_ENVELOPE, scaledSleeves, sleevesForGroup } from "../book/sleeves";
import { runBook, type BookResult, type MultiAsset, type ScanContext } from "../strategy/multi";

/**
 * The model book: what the research engine (runBook, same strategy code, modelled costs, perfect execution)
 * would have done on the live universe. Run per group after each pass on the assets the pass already loaded,
 * over a trailing window long enough to be warmed up (monthly sleeves re-rank twice, reversal holds ≤ 10 days).
 * Only the bar's return and holdings are kept: chaining the stored daily returns gives the model NAV.
 */
export const MODEL_WINDOW_DAYS = 200;
const D1 = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export type ModelPosition = { symbol: string; strategy: string; size: number; entry: number; stop: number; opened_at: string | null; pending: boolean };
export type ModelDay = {
  day: string;
  grp: "CRYPTO" | "STOCKS";
  day_return: number;
  equity: number;
  positions: ModelPosition[];
  trades: { symbol: string; strategy: string; pnl: number; r: number; exit_reason: string }[];
};

export function modelDayFrom(result: Pick<BookResult, "equity" | "trades" | "open_at_end">, barT: number, grp: ModelDay["grp"]): ModelDay | null {
  const n = result.equity.length;
  if (n < 2 || result.equity[n - 1].t !== barT) return null;
  const last = result.equity[n - 1].equity;
  const prev = result.equity[n - 2].equity;
  return {
    day: iso(barT),
    grp,
    day_return: prev > 0 ? last / prev - 1 : 0,
    equity: Math.round(last * 100) / 100,
    positions: result.open_at_end.map((p) => ({ ...p, opened_at: p.opened_at === null ? null : iso(p.opened_at) })),
    // "MANUAL" is runBook's end-of-window mark-to-market close, not a strategy exit.
    trades: result.trades.filter((x) => x.closed_at === barT && x.exit_reason !== "MANUAL").map((x) => ({ symbol: x.symbol, strategy: x.strategy, pnl: Math.round(x.pnl * 100) / 100, r: Math.round(x.r * 1000) / 1000, exit_reason: x.exit_reason })),
  };
}

export function runModelBook(input: { group: ModelDay["grp"]; assets: MultiAsset[]; references: ScanContext["references"]; bar: string; riskScale: number }): ModelDay | null {
  const t = Date.parse(`${input.bar}T00:00:00Z`);
  const result = runBook({
    assets: input.assets,
    references: input.references,
    sleeves: sleevesForGroup(input.group, scaledSleeves(input.riskScale)),
    envelope: MODEL_ENVELOPE,
    start: t - MODEL_WINDOW_DAYS * D1,
    end: t,
    starting_equity: 100_000,
    stock_execution: "NEXT_OPEN",
  });
  return modelDayFrom(result, t, input.group);
}

export async function saveModelDay(day: ModelDay, durationMs: number, errors: string[]): Promise<void> {
  try {
    const { error } = await getSupabase().from("trading_model_book").upsert({ ...day, duration_ms: durationMs }, { onConflict: "day,grp" });
    if (error) errors.push(`model_book: ${error.message.slice(0, 120)}`);
  } catch (err) {
    errors.push(`model_book: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
  }
}
