import { getSupabase } from "@/lib/supabase";
import { flattenAtBroker } from "./broker/flatten";
import { forceClose, realizedR } from "./position";
import { applyRiskScaleRequest } from "./risk-envelope";
import { getOpenTrades, getSettings, getUniverse, isAccountTrade, logEvent, setPlaybookStatus, simColumns, updateSettings, updateTrade, type TradeRow } from "./store";
import { PHASE_ORDER } from "./gates";
import { getBrokerStatus, getDashboard, lastPrices } from "./service-dashboard";
import { computePhaseGate } from "./service-gates";
import type { TradingPhase } from "./types";
import { round } from "./round";

/** Control commands from the app and the trading chat — the only write path a human has. */

const iso = (ms: number) => new Date(ms).toISOString();

export type ControlCommand =
  | { action: "pause_entries" }
  | { action: "resume_entries" }
  | { action: "set_playbook"; version: number; status: "ACTIVE" | "DISABLED" }
  | { action: "start_demo" }
  | { action: "stop_demo" }
  | { action: "set_agent"; enabled: boolean }
  | { action: "set_risk_scale"; value: number }
  | { action: "close_position"; trade_id: string }
  | { action: "close_all" }
  | { action: "set_symbol_enabled"; symbol: string; enabled: boolean }
  | { action: "add_calendar_event"; kind: "CPI" | "FOMC" | "EARNINGS" | "TOKEN_UNLOCK" | "OTHER_MACRO"; date: string; symbol?: string | null; note?: string | null }
  | { action: "rearm_kill_switch"; phrase: string }
  | { action: "set_phase"; phase: TradingPhase }
  | { action: "mark_review"; key: "reasoning_reviewed" | "resilience_reviewed" };

/** Commands the chat may PROPOSE (always executed only after explicit confirmation in the app). */
export const CHAT_ALLOWED_ACTIONS = ["pause_entries", "resume_entries", "set_risk_scale", "close_position", "close_all", "set_symbol_enabled", "add_calendar_event"] as const;

export type CloseOutcome = {
  closed: string[];
  failed: { symbol: string; reason: string }[];
  /** Closed without a live price — exit price and P&L are approximate. */
  estimated: string[];
};

/**
 * Close positions on demand (manual close, or the kill switch).
 *
 * Three things this has to get right, each of which it previously got wrong:
 *
 *  - A failing broker call must not abort the whole operation, but it must also
 *    not mark the trade closed. `flattenAtBroker` was awaited with no catch, so
 *    one Alpaca error threw out of the loop: nothing after it closed, and the
 *    caller got a bare 409. Marking it closed anyway would be worse — our books
 *    would read flat against a position the broker still holds.
 *  - A missing market price must not make a position impossible to close. It
 *    used to throw `no_price_<symbol>`, which meant the manual exit — the
 *    escape hatch — stopped working exactly when data feeds are flaky. The
 *    fallback chain now matches the kill switch in engine.ts, and an estimated
 *    exit is recorded as an event so the P&L is not silently trusted.
 *  - One bad symbol must not silently strand the rest. Every trade is attempted
 *    and the caller is told exactly which closed and which did not.
 */
async function closeTrades(trades: TradeRow[], reason: "MANUAL" | "KILL_SWITCH"): Promise<CloseOutcome> {
  const universe = await getUniverse();
  const prices = await lastPrices(trades, universe);
  const now = Date.now();
  const out: CloseOutcome = { closed: [], failed: [], estimated: [] };

  for (const t of trades) {
    const p = { ...t.sim_state };
    let brokerPx: number | null = null;
    if (t.broker) {
      try {
        brokerPx = await flattenAtBroker(t);
      } catch (err) {
        const detail = err instanceof Error ? err.message.slice(0, 120) : "broker_error";
        out.failed.push({ symbol: t.symbol, reason: `broker_flatten_failed: ${detail}` });
        continue;
      }
    }

    const market = prices.get(t.symbol);
    const price = brokerPx ?? market ?? p.entry_price ?? p.entry_limit;
    const ev = forceClose(p, price, reason, now);
    const estimated = brokerPx === null && market === undefined && p.state !== "PENDING";

    try {
      await updateTrade(t.id, {
        ...simColumns(p),
        events: [...(t.events ?? []), ...ev],
        ...(p.state === "CLOSED" ? { realized_r: round(realizedR(p), 3), realized_pnl: round(p.cash_flow, 2) } : {}),
      });
      out.closed.push(t.symbol);
      if (estimated) out.estimated.push(t.symbol);
    } catch (err) {
      out.failed.push({ symbol: t.symbol, reason: err instanceof Error ? err.message.slice(0, 120) : "update_failed" });
    }
  }
  return out;
}

export async function executeCommand(cmd: ControlCommand, source: "app" | "chat"): Promise<{ ok: true; message: string }> {
  const settings = await getSettings();
  const now = Date.now();
  const audit = (message: string, severity: "info" | "warn" | "critical" = "info") =>
    logEvent({ kind: `CONTROL:${cmd.action}`, message: `${message} (${source})`, severity, data: cmd });

  switch (cmd.action) {
    case "pause_entries":
      await updateSettings({ entries_paused: true });
      await audit("כניסות חדשות הושהו", "warn");
      return { ok: true, message: "כניסות חדשות הושהו" };
    case "resume_entries":
      await updateSettings({ entries_paused: false });
      await audit("כניסות חדשות חודשו");
      return { ok: true, message: "כניסות חודשו" };
    case "start_demo": {
      // Demo = Alpaca PAPER account only (the adapter has no live endpoint). The user chose to skip the
      // backtest/shadow gates for demo money; the bypass is recorded. Real money stays gated.
      if (source !== "app") throw new Error("app_only");
      const broker = await getBrokerStatus("ALPACA_PAPER");
      if (!broker.configured) throw new Error("alpaca_not_configured");
      if (!broker.connected || broker.equity === null) throw new Error(`alpaca_not_connected:${broker.error ?? ""}`);
      await updateSettings({ phase: "PAPER", execution_venue: "ALPACA_PAPER", phase_started_at: iso(now), starting_equity: broker.equity, peak_equity: broker.equity, entries_paused: false });
      await audit(`מסחר דמו חי הופעל בחשבון Alpaca Paper ($${Math.round(broker.equity)}) — שערי בקטסט/צל עוקפו לדמו בלבד`, "critical");
      return { ok: true, message: "demo started" };
    }
    case "stop_demo":
      if (source !== "app") throw new Error("app_only");
      await updateSettings({ execution_venue: "SIM", entries_paused: true });
      await audit("מסחר דמו הושהה: כניסות חדשות עצורות, פוזיציות קיימות ממשיכות להיות מנוהלות", "warn");
      return { ok: true, message: "demo paused" };
    case "set_playbook":
      if (source !== "app") throw new Error("app_only");
      await setPlaybookStatus(cmd.version, cmd.status);
      await audit(`playbook v${cmd.version} → ${cmd.status}`, "warn");
      return { ok: true, message: `playbook v${cmd.version} ${cmd.status}` };
    case "set_agent":
      await updateSettings({ agent_enabled: cmd.enabled });
      await audit(`שכבת הסוכן ${cmd.enabled ? "הופעלה" : "כובתה"}`, "warn");
      return { ok: true, message: `agent ${cmd.enabled ? "on" : "off"}` };
    case "set_risk_scale": {
      const res = applyRiskScaleRequest({ current: settings.risk_scale, requested: cmd.value, now });
      if (res.pending) {
        await updateSettings({ pending_risk_scale: res.pending.value, pending_risk_scale_at: iso(res.pending.effective_at) });
        await audit(`בקשת הגדלת סיכון ל-×${res.pending.value} — תיכנס לתוקף ב-${iso(res.pending.effective_at).slice(0, 16)}`, "warn");
        return { ok: true, message: `הגדלה נדחתה ל-24 שעות (חיכוך מכוון)` };
      }
      await updateSettings({ risk_scale: res.scale, pending_risk_scale: null, pending_risk_scale_at: null });
      await audit(`סיכון הוקטן ל-×${res.scale}`);
      return { ok: true, message: `סיכון ×${res.scale}` };
    }
    case "close_position": {
      const open = await getOpenTrades();
      const t = open.find((x) => x.id === cmd.trade_id);
      if (!t) throw new Error("trade_not_open");
      const res = await closeTrades([t], "MANUAL");
      if (res.failed.length) {
        // The position is still open at the broker — say so rather than
        // reporting a close that did not happen.
        await audit(`סגירת ${t.symbol} נכשלה: ${res.failed[0].reason}`, "critical");
        throw new Error(res.failed[0].reason);
      }
      const approx = res.estimated.length ? " (מחיר יציאה משוער — אין ציטוט חי)" : "";
      await audit(`${t.symbol} נסגרה ידנית${approx}`, "warn");
      return { ok: true, message: `${t.symbol} closed${approx}` };
    }
    case "close_all": {
      const open = (await getOpenTrades()).filter((t) => isAccountTrade(t, settings.phase));
      const res = await closeTrades(open, "MANUAL");
      const approx = res.estimated.length ? ` · ${res.estimated.length} במחיר משוער` : "";
      if (res.failed.length) {
        // Partial success is the common case when one symbol's broker call
        // fails; the old code threw and told the caller nothing about the rest.
        const detail = res.failed.map((f) => `${f.symbol}: ${f.reason}`).join("; ");
        await audit(`${res.closed.length} נסגרו, ${res.failed.length} נכשלו — ${detail}`, "critical");
        return {
          ok: true,
          message: `${res.closed.length} closed${approx}, ${res.failed.length} failed: ${detail}`,
        };
      }
      await audit(`${res.closed.length} פוזיציות נסגרו ידנית${approx}`, "warn");
      return { ok: true, message: `${res.closed.length} closed${approx}` };
    }
    case "set_symbol_enabled":
      await getSupabase().from("trading_universe").update({ manual_enabled: cmd.enabled, updated_at: iso(now) }).eq("symbol", cmd.symbol.toUpperCase());
      await audit(`${cmd.symbol} ${cmd.enabled ? "הופעל" : "כובה"}`);
      return { ok: true, message: `${cmd.symbol} ${cmd.enabled ? "on" : "off"}` };
    case "add_calendar_event": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cmd.date)) throw new Error("invalid_date");
      await getSupabase().from("trading_calendar").insert({ kind: cmd.kind, date: cmd.date, symbol: cmd.symbol?.toUpperCase() ?? null, note: cmd.note ?? null, source: source });
      await audit(`אירוע ${cmd.kind} ${cmd.symbol ?? ""} ${cmd.date} נוסף`);
      return { ok: true, message: "calendar event added" };
    }
    case "rearm_kill_switch": {
      if (source !== "app") throw new Error("app_only");
      if (cmd.phrase !== "ARM") throw new Error("confirmation_phrase_required");
      const dash = await getDashboard();
      // Re-arming resets the peak to current equity, otherwise it would trip again instantly.
      await updateSettings({ kill_switch_active: false, kill_switch_reason: null, kill_switch_at: null, peak_equity: dash.account.equity, entries_paused: true });
      await audit("מפסק ראשי אותחל ידנית — כניסות נשארות מושהות עד חידוש ידני", "critical");
      return { ok: true, message: "kill switch re-armed; entries remain paused" };
    }
    case "set_phase": {
      if (source !== "app") throw new Error("app_only");
      const from = PHASE_ORDER.indexOf(settings.phase);
      const to = PHASE_ORDER.indexOf(cmd.phase);
      if (to < 0) throw new Error("invalid_phase");
      if (to > from) {
        if (to !== from + 1) throw new Error("cannot_skip_phase");
        const gate = await computePhaseGate(settings);
        if (!gate.passes) throw new Error("gate_not_passed");
      }
      await updateSettings({ phase: cmd.phase, phase_started_at: iso(now), peak_equity: settings.starting_equity });
      await audit(`שלב שונה: ${settings.phase} → ${cmd.phase}`, "critical");
      return { ok: true, message: `phase ${cmd.phase}` };
    }
    case "mark_review":
      await logEvent({ kind: `GATE_REVIEW:${cmd.key}`, message: `אישור ידני: ${cmd.key}` });
      return { ok: true, message: "review recorded" };
  }
}

export function parseCommand(body: Record<string, unknown>): ControlCommand | null {
  const a = body.action;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  switch (a) {
    case "pause_entries":
    case "resume_entries":
    case "close_all":
      return { action: a };
    case "start_demo":
    case "stop_demo":
      return { action: a };
    case "set_playbook":
      return typeof body.version === "number" && (body.status === "ACTIVE" || body.status === "DISABLED") ? { action: a, version: body.version, status: body.status } : null;
    case "set_agent":
      return typeof body.enabled === "boolean" ? { action: a, enabled: body.enabled } : null;
    case "set_risk_scale":
      return typeof body.value === "number" && Number.isFinite(body.value) ? { action: a, value: body.value } : null;
    case "close_position":
      return s(body.trade_id) ? { action: a, trade_id: s(body.trade_id) } : null;
    case "set_symbol_enabled":
      return s(body.symbol) && typeof body.enabled === "boolean" ? { action: a, symbol: s(body.symbol), enabled: body.enabled } : null;
    case "add_calendar_event": {
      const kind = s(body.kind) as "CPI";
      if (!["CPI", "FOMC", "EARNINGS", "TOKEN_UNLOCK", "OTHER_MACRO"].includes(kind) || !s(body.date)) return null;
      return { action: a, kind, date: s(body.date), symbol: s(body.symbol) || null, note: s(body.note) || null };
    }
    case "rearm_kill_switch":
      return { action: a, phrase: s(body.phrase) };
    case "set_phase":
      return PHASE_ORDER.includes(body.phase as TradingPhase) ? { action: a, phase: body.phase as TradingPhase } : null;
    case "mark_review":
      return body.key === "reasoning_reviewed" || body.key === "resilience_reviewed" ? { action: a, key: body.key } : null;
    default:
      return null;
  }
}
