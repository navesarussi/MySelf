import { openRiskR } from "../position";
import { drawdownFromPeak } from "../risk-envelope";
import type { AssetClass } from "../types";
import type { Account, TickSummary } from "../tick-context";
import type { TradingSettings } from "../store";
import { getCommitteeConfig } from "./config";
import { envelopeFromAccount } from "./hard-risk";
import { createGeminiCommitteeLlm } from "./llm";
import { insertCommitteeRun } from "./store";
import { runCommitteeShadow, type CommitteeRunInput } from "./runner";
import type { OpportunityTicket } from "./types";

export type CommitteeHookItem = {
  ticket: OpportunityTicket;
  assetClass: AssetClass;
  vetoes: string[];
  envelopeBlocks: string[];
  triggerId?: string | null;
  headlines?: string[];
  earningsWindow?: boolean;
};

export type CommitteeHookContext = {
  settings: TradingSettings;
  account: Account;
  vix: number | null;
  btc_dominance_pct: number | null;
  funding_rate?: number | null;
  summary?: TickSummary;
};

/**
 * Isolated shadow hook — runs top-K tickets through the committee and persists audits.
 * Does not alter baseline entry/fill paths; no-op when COMMITTEE_ENABLED is false.
 */
export async function runCommitteeShadowBatch(items: CommitteeHookItem[], ctx: CommitteeHookContext): Promise<number> {
  const cfg = getCommitteeConfig();
  if (!cfg.enabled || !items.length) return 0;

  const batch = [...items].sort((a, b) => b.ticket.score - a.ticket.score).slice(0, cfg.maxPerTick);
  const llm = createGeminiCommitteeLlm();
  const envelope = envelopeFromAccount({
    equity: ctx.account.equity,
    peakEquity: Math.max(ctx.settings.peak_equity, ctx.account.equity),
    realizedToday: ctx.account.realizedToday,
    realizedWeek: ctx.account.realizedWeek,
    killSwitchActive: ctx.settings.kill_switch_active,
    entriesPaused: ctx.settings.entries_paused,
    openPositions: ctx.account.open,
  });
  const open_risk_r = ctx.account.open.reduce((s, t) => s + openRiskR(t.sim_state), 0);
  const portfolio = {
    open_risk_r,
    realized_r_today: ctx.account.realizedToday,
    realized_r_week: ctx.account.realizedWeek,
    drawdown_pct: drawdownFromPeak(ctx.account.equity, ctx.settings.peak_equity),
    open_positions: ctx.account.open.map((t) => ({ symbol: t.symbol, open_risk_r: openRiskR(t.sim_state) })),
  };

  let runs = 0;
  for (const item of batch) {
    try {
      const input: CommitteeRunInput = {
        ticket: item.ticket,
        assetClass: item.assetClass,
        envelope,
        vetoes: item.vetoes,
        envelopeBlocks: item.envelopeBlocks,
        equity: ctx.account.equity,
        riskScale: ctx.settings.risk_scale,
        shadow: cfg.shadow,
        triggerId: item.triggerId,
        llm,
        fundamental: {
          headlines: item.headlines ?? [],
          vix: ctx.vix,
          btc_dominance_pct: ctx.btc_dominance_pct,
          funding_rate: ctx.funding_rate ?? null,
          earnings_window: item.earningsWindow ?? false,
        },
        portfolio,
      };
      const result = await runCommitteeShadow(input);
      await insertCommitteeRun(result);
      runs += 1;
      if (ctx.summary) ctx.summary.errors.push(...result.errors.map((e) => `committee:${item.ticket.symbol}:${e}`).slice(0, 2));
    } catch (err) {
      ctx.summary?.errors.push(`committee_hook ${item.ticket.symbol}: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
  }
  return runs;
}
