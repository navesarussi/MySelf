import { getSupabase } from "@/lib/supabase";
import { alpaca, ensureProtectiveStop, fromAlpacaPositionSymbol, isAlpacaConfigured, isDustPosition } from "../broker/alpaca";
import { duePasses, type BookState } from "../book/engine";
import { getOpenTrades, getSettings, logEvent, symbolsLoggedOn } from "../store";
import { alertsToSend, evaluateHealth, type HealthReport } from "./health-core";

const D1 = 86_400_000;
/** A pass is overdue this long after its bar could first be processed (crypto 00:00 UTC; stocks ~21:20 UTC at the latest). */
const PASS_GRACE_MS = 3 * 3_600_000;

function passDueAt(group: string, bar: string): number {
  const t = Date.parse(`${bar}T00:00:00Z`);
  return group === "CRYPTO" ? t + D1 : t + 21 * 3_600_000 + 20 * 60_000;
}

/**
 * Gather the snapshot, repair unprotected positions (main tick only — the mirror of the same tick already ran),
 * evaluate, store the report in trading_settings.health, push new critical alerts and recoveries.
 */
export async function runHealthChecks(now: number, source: "main" | "intraday", errors: string[]): Promise<HealthReport | null> {
  if (!isAlpacaConfigured()) return null;
  try {
    const settings = await getSettings();
    const [positions, orders] = await Promise.all([alpaca.positions(), alpaca.allOpenOrders()]);
    const sells = orders.filter((o) => o.side === "sell").map((o) => ({ symbol: fromAlpacaPositionSymbol(o.symbol), type: o.type }));
    const pos = positions.map((p) => ({ symbol: fromAlpacaPositionSymbol(p.symbol), dust: isDustPosition(p), qty: Number(p.qty) }));

    if (source === "main") {
      const covered = new Set(sells.filter((o) => ["stop", "stop_limit", "trailing_stop", "market"].includes(o.type)).map((o) => o.symbol));
      const naked = pos.filter((p) => !p.dust && !covered.has(p.symbol));
      if (naked.length) {
        const open = await getOpenTrades();
        for (const p of naked) {
          const t = open.find((x) => x.symbol === p.symbol && x.broker);
          const stop = t ? Number(t.stop_price ?? t.sim_state?.stop_price) : NaN;
          if (!t || !(stop > 0)) continue;
          const placed = await ensureProtectiveStop({ tradeId: t.id, symbol: t.symbol, assetClass: t.asset_class, qty: p.qty, stop, now }).catch(() => null);
          if (placed) {
            sells.push({ symbol: p.symbol, type: placed.type });
            await logEvent({ kind: "HEALTH_STOP_REPAIRED", symbol: p.symbol, severity: "warn", message: `הונח סטופ חסר ל-${p.symbol} ב-${stop}`, push: true });
          }
        }
      }
    }

    const state = (settings.book_state ?? {}) as BookState;
    const overdue = (await duePasses(state, now)).filter((d) => now - passDueAt(d.group, d.bar) > PASS_GRACE_MS).map((d) => `${d.group} ${d.bar}`);
    const tickErrors = ((settings.last_tick_summary?.errors as string[] | undefined) ?? []).filter((e) => !e.startsWith("model_"));

    const prev = (settings.health ?? null) as unknown as HealthReport | null;
    const report = evaluateHealth({
      prev_naked: prev?.checks.find((c) => c.id === "protective_stop")?.subjects ?? [],
      now,
      source,
      last_tick_at: settings.last_tick_at,
      last_intraday_tick_at: settings.last_intraday_tick_at,
      intraday_enabled: settings.intraday_enabled,
      positions: pos,
      open_sell_orders: sells,
      overdue_passes: overdue,
      last_tick_errors: tickErrors,
      kill_switch_active: settings.kill_switch_active,
    });

    const day = new Date(now).toISOString().slice(0, 10);
    const critical = report.checks.filter((c) => c.level === "critical");
    const reported = new Map<string, Set<string>>();
    for (const c of critical) reported.set(c.id, new Set(await symbolsLoggedOn(`HEALTH_${c.id.toUpperCase()}`, day)));
    // Either tick's last report: a heartbeat one tick raised is resolved by the other tick running again.
    const { raise, resolved } = alertsToSend(prev, report, reported);
    // One row per subject (the once-a-day dedupe reads them), one push per check.
    for (const id of new Set(raise.map((a) => a.id))) {
      const items = raise.filter((a) => a.id === id);
      for (const a of items) await logEvent({ kind: `HEALTH_${id.toUpperCase()}`, symbol: a.subject, severity: "critical", message: a.message });
      await logEvent({ kind: "HEALTH_ALERT", severity: "critical", message: items[0].message, push: true });
    }
    for (const id of resolved) await logEvent({ kind: "HEALTH_RESOLVED", severity: "info", message: `תקין שוב: ${id}`, push: true });

    await getSupabase().from("trading_settings").update({ health: report }).eq("id", true);
    return report;
  } catch (err) {
    errors.push(`health: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    return null;
  }
}
