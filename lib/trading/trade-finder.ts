import { getSupabase } from "@/lib/supabase";
import { attachProposalTrade, claimProposal, releaseProposal } from "./proposal-claim";
import { planIntradayTrade, type RatingSnapshot, type TradePlanProposal } from "./agent-rater";
import { RISK_ENVELOPE } from "./config";
import { MANUAL_STRATEGY_VERSION } from "./engine";
import { livePrice, loadIntradayFrames, type IntradaySymbol, type LoadedFrames } from "./intraday-data";
import { insertIntradayTrade, intradayEnvelopeBlocks, loadIntradayAccount, placeIntradayBrokerEntry, ratingSnapshotFor, scannableSymbols, sizeIntraday, stockSession, symbolsToLoad, syncBrokerEntryNow } from "./intraday-engine";
import { getIntradayUniverse, type IntradayUniverseRow } from "./intraday-universe";
import { M15, M5, confirmOn5m, detectIntradaySetup, features, intradayParamsFor, planAtPrice, scoreIntraday, type IntradayParams, type IntradaySetupHit } from "./strategy/intraday";
import { closedIdx } from "./strategy/series";
import { getSettings, logEvent } from "./store";

/**
 * "Search trade" button: rank every scannable symbol by how close it is to a valid long setup right now, let
 * הסוכן מסחר plan the top few (order type, entry, stop, target, 1–10 rating + explanation) under code-enforced limits,
 * and store the result as a short-lived proposal. "Enter now" re-validates against the live price and the risk envelope.
 */

export type ProposalTier = "CONFIRMED" | "ARMED" | "RECENT" | "WATCH";
const TIER_WEIGHT: Record<ProposalTier, number> = { CONFIRMED: 3, ARMED: 2, RECENT: 1, WATCH: 0 };
const PROPOSAL_TTL_MS = 10 * 60_000;
const RECENT_BARS = 8;
const PLANNED = 3;

export type FinderCandidate = {
  symbol: string;
  asset_class: IntradayUniverseRow["asset_class"];
  tier: ProposalTier;
  setup: string;
  score: number;
  price: number;
  atr15: number;
  entry: number;
  stop: number;
  target: number;
  rr: number;
  structural_stop: number;
  range: IntradaySetupHit["range"];
  features: IntradaySetupHit["features"];
  setup_bar_time: number | null;
};

/** Pure ranking for one symbol — the best (highest-tier) plan available at `now`, or null. */
export function evaluateSymbol(lf: LoadedFrames, now: number, p: IntradayParams): FinderCandidate | null {
  const { f, sym, lastPrice: price } = lf;
  const s15 = f.s15;
  const last = closedIdx(s15, now);
  if (last < 0) return null;
  const atr15 = s15.atr[last];
  if (!(atr15 > 0) || !(price > 0)) return null;
  const mk = (tier: ProposalTier, h: IntradaySetupHit | null, stop: number, target: number, setup: string, score: number): FinderCandidate | null => {
    const plan = planAtPrice(price, stop, target, atr15, p);
    if (!plan) return null;
    return { symbol: sym.symbol, asset_class: sym.asset_class, tier, setup, score, price, atr15, entry: plan.entry, stop: plan.stop, target: plan.target, rr: plan.rr, structural_stop: stop, range: h?.range ?? null, features: h?.features ?? features(s15, last), setup_bar_time: h ? s15.bars[h.i].t : null };
  };
  for (let i = last; i >= Math.max(0, last - RECENT_BARS + 1); i--) {
    const h = detectIntradaySetup(s15, i, p);
    if (!h) continue;
    // Invalidated since the setup: any 5m low through the structural stop.
    const armedAt = s15.bars[h.i].t + M15;
    const broken = f.s5.bars.some((b) => b.t >= armedAt && b.t + M5 <= now && b.l <= h.stop);
    if (broken || price <= h.stop || price >= h.structural_target) continue;
    const c = confirmOn5m(f, h, now, p);
    const windowOpen = now <= armedAt + p.confirm_window_5m * M5;
    const tier: ProposalTier = c ? (now - c.confirm_time <= 10 * 60_000 ? "CONFIRMED" : "RECENT") : windowOpen ? "ARMED" : "RECENT";
    const cand = mk(tier, h, h.stop, h.structural_target, h.setup, h.score);
    if (cand) return cand;
  }
  // No setup: a trend-aligned symbol with a nearby structural low (the agent is told to be stricter here).
  if (!(s15.bars[last].c > s15.ema200[last] && s15.ema50[last] > s15.ema200[last])) return null;
  let low = Infinity;
  for (let k = Math.max(0, last - 5); k <= last; k++) low = Math.min(low, s15.bars[k].l);
  const feats = features(s15, last);
  return mk("WATCH", null, low - p.stop_buffer_atr * atr15, 0, "TREND_WATCH", Math.max(0, scoreIntraday("BREAKOUT_15M", feats) - 20));
}

export function rankCandidates(list: FinderCandidate[]): FinderCandidate[] {
  return [...list].sort((a, b) => TIER_WEIGHT[b.tier] - TIER_WEIGHT[a.tier] || b.score - a.score || b.rr - a.rr);
}

export type ProposalOption = FinderCandidate & {
  plan: TradePlanProposal;
  broker_tradable: boolean;
  preview: { size: number; notional: number; risk_amount: number; risk_pct: number } | null;
  envelope_blocks: string[];
  rating_input: RatingSnapshot;
};

export type ProposalPayload = {
  id: string;
  created_at: string;
  expires_at: string;
  scanned: number;
  stocks_open: boolean;
  equity: number;
  options: ProposalOption[];
  errors: string[];
};

export async function findBestTrade(now = Date.now()): Promise<ProposalPayload | { id: null; scanned: number; stocks_open: boolean; options: []; errors: string[] }> {
  const errors: string[] = [];
  const settings = await getSettings();
  const universe = await getIntradayUniverse();
  const session = await stockSession(now);
  const scannable = scannableSymbols(universe, session).filter((u) => u.asset_class !== "STOCK" || session.canEnter);
  const frames = await loadIntradayFrames(symbolsToLoad(scannable, [], session), now, errors);
  const byRow = new Map(universe.map((u) => [u.symbol, u]));

  const lastPrices = new Map([...frames].map(([s, lf]) => [s, lf.lastPrice]));
  const ia = await loadIntradayAccount(settings, lastPrices, now, errors);
  // Symbols already held (by any strategy) can't be entered again — don't spend agent calls on them.
  const held = new Set(ia.account.open.map((t) => t.symbol));

  const candidates: FinderCandidate[] = [];
  for (const u of scannable) {
    const lf = frames.get(u.symbol);
    if (!lf || held.has(u.symbol)) continue;
    const c = evaluateSymbol(lf, now, intradayParamsFor(u.asset_class));
    if (c) candidates.push(c);
  }
  const top = rankCandidates(candidates).slice(0, PLANNED);
  if (!top.length) return { id: null, scanned: frames.size, stocks_open: session.open, options: [], errors };

  const options: ProposalOption[] = await Promise.all(
    top.map(async (c) => {
      const lf = frames.get(c.symbol)!;
      const p = intradayParamsFor(c.asset_class);
      const ratingInput = ratingSnapshotFor({
        sym: lf.sym,
        lf,
        frames,
        at: now,
        candidate: { setup: c.setup, score: c.score, entry: c.entry, stop: c.stop, target: c.target, rr: c.rr, stop_distance: c.entry - c.stop, range: c.range, features: c.features, setup_bar_time: c.setup_bar_time ?? now, confirm_time: now },
      });
      const plan = await planIntradayTrade({ snap: ratingInput, tier: c.tier, price: c.price, atr15: c.atr15, minStopPct: p.min_stop_pct, maxStopAtr: p.max_stop_atr, minRr: RISK_ENVELOPE.MIN_RR_RATIO });
      const sized = sizeIntraday({ entry: plan.entry, stop: plan.stop, assetClass: c.asset_class, ia, riskScale: settings.risk_scale });
      return {
        ...c,
        plan,
        broker_tradable: Boolean(byRow.get(c.symbol)?.broker_tradable),
        preview: sized ? { size: sized.size, notional: sized.notional, risk_amount: sized.risk_amount, risk_pct: sized.risk_amount / ia.account.equity } : null,
        envelope_blocks: intradayEnvelopeBlocks(settings, ia.account, c.symbol),
        rating_input: ratingInput,
      };
    })
  );
  // Best = highest agent rating; ties keep the deterministic order.
  options.sort((a, b) => (b.plan.rating ?? 0) - (a.plan.rating ?? 0) || TIER_WEIGHT[b.tier] - TIER_WEIGHT[a.tier] || b.score - a.score);

  const expires = now + PROPOSAL_TTL_MS;
  const { data, error } = await getSupabase()
    .from("trading_proposals")
    .insert({ status: "PROPOSED", symbol: options[0].symbol, payload: { options, scanned: frames.size, stocks_open: session.open, equity: ia.account.equity, errors }, expires_at: new Date(expires).toISOString() })
    .select("id, created_at")
    .single();
  if (error) throw new Error(`proposal insert: ${error.message}`);
  return { id: data.id as string, created_at: data.created_at as string, expires_at: new Date(expires).toISOString(), scanned: frames.size, stocks_open: session.open, equity: ia.account.equity, options, errors };
}

// ── Enter now ──────────────────────────────────────────────────────────────

export type EnterRequest = { option?: number; order_type?: "MARKET" | "LIMIT"; entry?: number; stop?: number; target?: number };

export class EnterError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Validate a (possibly user-edited) plan against the live price. Pure — the hard rules of a manual entry. */
export function validateManualPlan(input: { order_type: "MARKET" | "LIMIT"; live: number; entry?: number; stop: number; target: number; minStopPct: number; userEditedTarget: boolean }) {
  const entry = input.order_type === "MARKET" ? input.live : Number(input.entry);
  if (!(entry > 0)) throw new EnterError("invalid_entry");
  if (!(input.stop > 0) || input.stop >= entry) throw new EnterError(input.order_type === "MARKET" ? "price_below_stop" : "stop_not_below_entry");
  // Sanity floor for user edits (0.3%); the agent/strategy plan already respects its own larger minimum.
  if (entry - input.stop < entry * Math.min(0.003, input.minStopPct)) throw new EnterError("stop_too_tight");
  const minTarget = entry + RISK_ENVELOPE.MIN_RR_RATIO * (entry - input.stop);
  let target = input.target;
  const notes: string[] = [];
  if (!(target >= minTarget)) {
    // Price moved since the plan: lift an untouched target to 2R; an explicit user target below 2R is refused.
    if (input.userEditedTarget) throw new EnterError("target_below_2r");
    target = minTarget;
    notes.push("target_lifted_to_2r");
  }
  return { entry, stop: input.stop, target, notes };
}

export async function enterProposal(id: string, req: EnterRequest, now = Date.now()) {
  const sb = getSupabase();
  const { data: row, error } = await sb.from("trading_proposals").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new EnterError("proposal_not_found");
  if (row.status !== "PROPOSED") throw new EnterError("proposal_already_used");
  if (Date.parse(row.expires_at) < now) throw new EnterError("proposal_expired");
  const payload = row.payload as { options: ProposalOption[] };
  const opt = payload.options[req.option ?? 0];
  if (!opt) throw new EnterError("option_not_found");

  // This call places a real (paper) order, so the proposal is consumed before
  // any of the work below — the read above is a friendly early error, not the
  // guard. Without an atomic claim a double tap or a retried request runs this
  // whole function twice and opens two positions in one symbol at full size.
  if (!(await claimProposal(sb, id))) throw new EnterError("proposal_already_used");
  try {
    return await enterClaimedProposal({ sb, id, opt, req, now });
  } catch (err) {
    // Nothing was opened — hand the proposal back so the user can adjust and
    // retry. `releaseProposal` refuses once a trade_id exists.
    await releaseProposal(sb, id).catch(() => undefined);
    throw err;
  }
}

async function enterClaimedProposal(input: {
  sb: ReturnType<typeof getSupabase>;
  id: string;
  opt: ProposalOption;
  req: EnterRequest;
  now: number;
}) {
  const { sb, id, opt, req, now } = input;

  const settings = await getSettings();
  // Only real trades: an entry goes to the Alpaca demo account or it does not happen.
  if (settings.phase !== "PAPER") throw new EnterError(`phase_${settings.phase.toLowerCase()}`);
  if (settings.kill_switch_active) throw new EnterError("kill_switch_active");
  if (!opt.broker_tradable) throw new EnterError("not_broker_tradable");
  const sym: IntradaySymbol = { symbol: opt.symbol, asset_class: opt.asset_class, provider_symbol: opt.asset_class === "STOCK" ? opt.symbol : `${opt.symbol}USDT` };
  if (sym.asset_class === "STOCK" && !(await stockSession(now)).canEnter) throw new EnterError("stock_market_closed");
  const live = await livePrice(sym);
  if (!live) throw new EnterError("no_live_price");

  const orderType = req.order_type ?? opt.plan.order_type;
  const p = intradayParamsFor(sym.asset_class);
  const v = validateManualPlan({
    order_type: orderType,
    live,
    entry: req.entry ?? opt.plan.entry,
    stop: req.stop ?? opt.plan.stop,
    target: req.target ?? opt.plan.target,
    minStopPct: p.min_stop_pct,
    userEditedTarget: req.target !== undefined && req.target !== opt.plan.target,
  });
  if (orderType === "LIMIT" && v.entry >= live) throw new EnterError("limit_above_price");

  const errors: string[] = [];
  const ia = await loadIntradayAccount(settings, new Map([[sym.symbol, live]]), now, errors);
  if (!ia.useBroker) throw new EnterError("broker_unavailable");
  if (ia.brokerHeld.has(sym.symbol)) throw new EnterError("already_in_symbol");
  const blocks = intradayEnvelopeBlocks(settings, ia.account, sym.symbol);
  if (blocks.length) throw new EnterError(`envelope:${blocks.join(",")}`);
  // Sim fills a MARKET entry on the next 5m bar within a 0.5% tolerance; a LIMIT waits up to an hour.
  const simLimit = orderType === "MARKET" ? v.entry * 1.005 : v.entry;
  const plan = sizeIntraday({ entry: simLimit, stop: v.stop, assetClass: sym.asset_class, ia, riskScale: settings.risk_scale });
  if (!plan) throw new EnterError("size_zero");

  const execution = "PAPER";
  const snapshot = { proposal_id: id, option: req.option ?? 0, tier: opt.tier, candidate: { ...opt, rating_input: undefined }, agent_plan: opt.plan, user_overrides: req, live_price: live, validation_notes: v.notes, rating_input: opt.rating_input };
  const { data: trig, error: trigErr } = await sb
    .from("trading_triggers")
    .insert({
      symbol: sym.symbol,
      asset_class: sym.asset_class,
      mode: "INTRADAY",
      bucket_id: `manual:${opt.setup}`,
      bar_time: new Date(now).toISOString(),
      setup: opt.setup,
      score: opt.score,
      snapshot,
      vetoes: [],
      envelope_blocks: [],
      plan: { ...plan, target: v.target, order_type: orderType },
      deterministic_decision: "ENTER",
      baseline_enter: true,
      param_version: p.version,
      strategy_version: MANUAL_STRATEGY_VERSION,
      phase: settings.phase,
      agent_rating: opt.plan.rating,
      agent_rating_explanation: opt.plan.explanation,
      agent_reasoning: opt.plan.explanation,
      agent_model_version: opt.plan.model_version,
      prompt_version: opt.plan.prompt_version,
      agent_error: opt.plan.error,
    })
    .select("id")
    .single();
  if (trigErr) throw new Error(trigErr.message);

  const tradeId = await insertIntradayTrade({
    trigger_id: String(trig.id),
    sym,
    strategy_version: MANUAL_STRATEGY_VERSION,
    setup: opt.setup,
    score: opt.score,
    execution,
    plan,
    target: v.target,
    trigger_time: now,
    snapshot,
    chart: [],
    agent: { rating: opt.plan.rating, explanation: opt.plan.explanation, model_version: opt.plan.model_version, prompt_version: opt.plan.prompt_version },
    pending_expiry_bars: orderType === "LIMIT" ? 12 : 1,
  });
  // Bind the proposal to the trade the moment the trade exists, so a failure
  // further down can never hand the proposal back and let a second attempt
  // create a second trade for it. A broker rejection therefore consumes the
  // proposal — the attempt is recorded, and the search is cheap to re-run.
  await attachProposalTrade(sb, id, tradeId);

  const placed = await placeIntradayBrokerEntry({ tradeId, sym, plan: { ...plan, entry: v.entry }, target: v.target, orderType: orderType === "MARKET" ? "market" : "limit", now });
  if (!placed.ok) throw new EnterError(`broker_rejected:${placed.reason ?? ""}`);
  const broker = true;
  let state: string | null = "PENDING";
  if (orderType === "MARKET") {
    // Give the market order a moment to fill, then adopt the fill + place the protective stop now.
    for (let attempt = 0; attempt < 3 && state === "PENDING"; attempt++) {
      await new Promise((r) => setTimeout(r, 1200));
      state = await syncBrokerEntryNow(tradeId).catch(() => "PENDING");
    }
  }
  await logEvent({
    kind: "MANUAL_ENTRY",
    symbol: sym.symbol,
    message: `[Alpaca demo] כניסה מהחיפוש: ${sym.symbol} ${orderType} ${v.entry.toPrecision(6)} · סטופ ${v.stop.toPrecision(6)} · יעד ${v.target.toPrecision(6)} · דירוג ${opt.plan.rating ?? "—"}/10`.slice(0, 300),
    push: true,
  });
  return { trade_id: tradeId, broker, state, order_type: orderType, entry: v.entry, stop: v.stop, target: v.target, size: plan.size, notes: v.notes };
}

export type { LoadedFrames };
