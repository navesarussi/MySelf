export type HealthLevel = "ok" | "warn" | "critical";
export type HealthCheckId = "main_heartbeat" | "intraday_heartbeat" | "protective_stop" | "book_pass" | "tick_errors" | "kill_switch";
export type HealthCheck = { id: HealthCheckId; level: HealthLevel; message: string; subjects: string[] };
export type HealthReport = { status: HealthLevel; checked_at: string; source: "main" | "intraday"; checks: HealthCheck[] };

export type HealthSnapshot = {
  now: number;
  source: "main" | "intraday";
  last_tick_at: string | null;
  last_intraday_tick_at: string | null;
  intraday_enabled: boolean;
  /** Broker positions, our symbol form (BTC, not BTCUSD). */
  positions: { symbol: string; dust: boolean }[];
  /** Open sell orders (legs listed on their own), our symbol form. */
  open_sell_orders: { symbol: string; type: string }[];
  /** Book passes due for more than the grace period, e.g. "STOCKS 2026-09-29". */
  overdue_passes: string[];
  last_tick_errors: string[];
  kill_switch_active: boolean;
  /** Symbols the previous report found without protection (either tick). */
  prev_naked?: string[];
};

export const MAIN_TICK_STALE_MS = 40 * 60_000;
export const INTRADAY_TICK_STALE_MS = 20 * 60_000;
/** A resting stop, or an exit already queued at market (a stock exit waits for the open). A limit alone is not protection. */
const PROTECTIVE_TYPES = new Set(["stop", "stop_limit", "trailing_stop", "market"]);
const RANK: Record<HealthLevel, number> = { ok: 0, warn: 1, critical: 2 };

const ageMs = (iso: string | null, now: number) => (iso ? now - Date.parse(iso) : Infinity);
const mins = (ms: number) => (Number.isFinite(ms) ? `${Math.round(ms / 60_000)} דק׳` : "אף פעם");

export function evaluateHealth(s: HealthSnapshot): HealthReport {
  const checks: HealthCheck[] = [];
  const mainAge = ageMs(s.last_tick_at, s.now);
  checks.push(
    s.source === "intraday" && mainAge > MAIN_TICK_STALE_MS
      ? { id: "main_heartbeat", level: "critical", message: `ה-tick הראשי לא רץ ${mins(mainAge)}`, subjects: [] }
      : { id: "main_heartbeat", level: "ok", message: "", subjects: [] }
  );
  const intraAge = ageMs(s.last_intraday_tick_at, s.now);
  checks.push(
    s.source === "main" && s.intraday_enabled && intraAge > INTRADAY_TICK_STALE_MS
      ? { id: "intraday_heartbeat", level: "critical", message: `ה-tick התוך-יומי לא רץ ${mins(intraAge)}`, subjects: [] }
      : { id: "intraday_heartbeat", level: "ok", message: "", subjects: [] }
  );
  const covered = new Set(s.open_sell_orders.filter((o) => PROTECTIVE_TYPES.has(o.type)).map((o) => o.symbol));
  const naked = s.positions.filter((p) => !p.dust && !covered.has(p.symbol)).map((p) => p.symbol).sort();
  // Critical only on a second sighting: OTO stop legs are day orders that expire at the close and the next main
  // tick re-places them (2026-09-30 20:01 UTC — four false alarms in the two minutes between).
  const prev = new Set(s.prev_naked ?? []);
  const persistent = naked.filter((x) => prev.has(x));
  checks.push(
    persistent.length
      ? { id: "protective_stop", level: "critical", message: `פוזיציות בלי סטופ אצל הברוקר: ${persistent.join(", ")}`, subjects: persistent }
      : naked.length
        ? { id: "protective_stop", level: "warn", message: `בלי סטופ, נבדק שוב ב-tick הבא: ${naked.join(", ")}`, subjects: naked }
        : { id: "protective_stop", level: "ok", message: "", subjects: [] }
  );
  checks.push({ id: "book_pass", level: s.overdue_passes.length ? "critical" : "ok", message: s.overdue_passes.length ? `מעבר ספר באיחור: ${s.overdue_passes.join(", ")}` : "", subjects: s.overdue_passes });
  checks.push({ id: "tick_errors", level: s.last_tick_errors.length ? "warn" : "ok", message: s.last_tick_errors.slice(0, 3).join(" | ").slice(0, 300), subjects: [] });
  checks.push({ id: "kill_switch", level: s.kill_switch_active ? "critical" : "ok", message: s.kill_switch_active ? "מתג הכיבוי פעיל — אין כניסות חדשות" : "", subjects: [] });
  const status = checks.reduce<HealthLevel>((w, c) => (RANK[c.level] > RANK[w] ? c.level : w), "ok");
  return { status, checked_at: new Date(s.now).toISOString(), source: s.source, checks };
}

/** Critical subjects not yet reported today, and checks that were critical and are ok now. */
export function alertsToSend(prev: HealthReport | null, next: HealthReport, reported: Map<string, Set<string>>): { raise: { id: string; subject: string; message: string }[]; resolved: string[] } {
  const raise: { id: string; subject: string; message: string }[] = [];
  for (const c of next.checks) {
    if (c.level !== "critical") continue;
    for (const subject of c.subjects.length ? c.subjects : ["_"]) {
      if (!reported.get(c.id)?.has(subject)) raise.push({ id: c.id, subject, message: c.message });
    }
  }
  const resolved = (prev?.checks ?? []).filter((c) => c.level === "critical" && next.checks.find((n) => n.id === c.id)?.level === "ok").map((c) => c.id);
  return { raise, resolved };
}
