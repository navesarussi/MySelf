/**
 * Informational: which open positions exceed ENTRY_GUARDS notional caps.
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/trading/open-position-cap-check.ts
 */
import { ENTRY_GUARDS } from "../../lib/trading/config";

type Row = { symbol: string; asset_class: string; entry_price: number | null; entry_limit: number | null; position_size: number; remaining_size: number | null };

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("No SUPABASE credentials — skipping open-position cap report.");
    return;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { db: { schema: "myself" } });
  const [{ data: trades, error: tErr }, { data: settings, error: sErr }] = await Promise.all([
    sb.from("trading_trades").select("symbol, asset_class, entry_price, entry_limit, position_size, remaining_size").in("state", ["OPEN", "RISK_FREE", "PENDING"]),
    sb.from("trading_settings").select("peak_equity").eq("id", true).maybeSingle(),
  ]);
  if (tErr) throw new Error(tErr.message);
  if (sErr) throw new Error(sErr.message);
  const equity = Number(settings?.peak_equity) || 100_000;
  const pctCap = ENTRY_GUARDS.MAX_POSITION_NOTIONAL_PCT * equity;
  const absCap = ENTRY_GUARDS.MAX_POSITION_NOTIONAL_USD;
  const cap = Math.min(pctCap, absCap);
  console.log(`Equity (peak): $${equity.toLocaleString()} · per-position cap: $${Math.round(cap).toLocaleString()} (${ENTRY_GUARDS.MAX_POSITION_NOTIONAL_PCT * 100}% / $${ENTRY_GUARDS.MAX_POSITION_NOTIONAL_USD.toLocaleString()})`);
  const violators: { symbol: string; notional: number; cap: number }[] = [];
  for (const t of (trades ?? []) as Row[]) {
    const px = Number(t.entry_price ?? t.entry_limit) || 0;
    const qty = Number(t.remaining_size ?? t.position_size) || 0;
    const notional = px * qty;
    if (notional > cap + 1) violators.push({ symbol: t.symbol, notional, cap });
  }
  if (!violators.length) {
    console.log("No open positions exceed the new caps.");
    return;
  }
  console.log(`\n${violators.length} open position(s) would violate caps (informational — not closed):\n`);
  for (const v of violators.sort((a, b) => b.notional - a.notional)) {
    console.log(`  ${v.symbol}: $${Math.round(v.notional).toLocaleString()} (cap $${Math.round(v.cap).toLocaleString()})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
