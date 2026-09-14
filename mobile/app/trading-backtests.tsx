import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../src/api/resources";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { queryClient, queryKeys, useApiMutation, useApiQuery } from "../src/query";
import { Badge, Btn, Card, Chip, EmptyState, Loading, Row, Screen, SectionTitle } from "../src/components/ui";
import { GroupBars, KpiGrid, RHistogram, SeriesChart } from "../src/components/trading/charts";
import { GateChecklist, TradingText } from "../src/components/trading/blocks";
import { fmtDateTime, fmtPct, fmtR, fmtUsd } from "@/lib/trading/format";

type Preset = "CRYPTO" | "STOCKS" | "ALL";

function BacktestDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const { row } = useLayoutDir();
  const { data } = useApiQuery(queryKeys.tradingBacktest(id), (cfg) => api.tradingBacktest(cfg, id), { staleTime: 10 * 60_000 });
  const [variant, setVariant] = useState(0);
  if (!data) return <Loading />;
  const res = data.results[variant];
  if (!res) return null;
  const s = res.stats;
  return (
    <View>
      <Row wrap>
        {data.results.map((r, i) => (
          <Chip key={r.variant} label={`${t(`trading.variant_${r.variant}`)} ${fmtR(r.stats.expectancy_r)}`} active={variant === i} onPress={() => setVariant(i)} />
        ))}
      </Row>
      <View style={{ height: 10 }} />
      <KpiGrid
        items={[
          { label: t("trading.trades"), value: String(s.trades), hint: `triggers ${res.triggers}` },
          { label: t("trading.winRate"), value: fmtPct(s.win_rate), hint: `1R ${fmtPct(s.reached_1r_rate, 0)}` },
          { label: t("trading.expectancy"), value: fmtR(s.expectancy_r, 3), tone: s.expectancy_r > 0 ? "good" : "warn" },
          { label: t("trading.profitFactor"), value: String(s.profit_factor ?? "∞") },
          { label: t("trading.maxDd"), value: `${s.max_drawdown_r}R`, hint: `equity ${fmtPct(res.max_equity_dd_pct)}` },
          { label: "Return", value: fmtPct(res.return_pct), tone: res.return_pct > (res.benchmark_return_pct ?? 0) ? "good" : "warn", hint: `B&H ${fmtPct(res.benchmark_return_pct)}` },
        ]}
      />
      <Card>
        <SeriesChart values={res.equity_curve.map((p) => p.equity)} title={t("trading.equityCurve")} format={(v) => fmtUsd(v)} />
      </Card>
      <Card>
        <RHistogram bins={res.r_distribution} title={t("trading.rDistribution")} />
      </Card>
      <Card>
        <TradingText size={tokens.textXs}>{t("trading.monteCarlo", { dd: fmtPct(res.monte_carlo.max_dd_pct_p95), kill: fmtPct(res.monte_carlo.prob_kill_switch, 0) })}</TradingText>
        <TradingText muted size={tokens.textXs}>
          final R p5 {res.monte_carlo.final_r_p5} · p50 {res.monte_carlo.final_r_p50} · DD R p95 {res.monte_carlo.max_dd_r_p95}
        </TradingText>
        {res.kill_switch_tripped_at ? (
          <View style={{ alignSelf: "flex-start", marginTop: 6 }}>
            <Badge label={`KILL SWITCH ${fmtDateTime(res.kill_switch_tripped_at)}`} tone="warn" />
          </View>
        ) : null}
      </Card>
      {data.walk_forward ? (
        <Card>
          <GroupBars
            title={`${t("trading.walkForward")} · OOS ${fmtR(data.walk_forward.oos_expectancy_r, 3)}`}
            rows={data.walk_forward.folds.map((f) => ({ key: `#${f.fold} ${new Date(f.start).toISOString().slice(2, 7)}`, value: f.stats.expectancy_r, sub: String(f.stats.trades) }))}
          />
        </Card>
      ) : null}
      <Card>
        <TradingText muted bold size={tokens.textXs}>
          {t("trading.blockedCounts")}
        </TradingText>
        <View style={{ ...row, flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {Object.entries({ ...res.blocked, ...res.cancelled }).map(([k, v]) => (
            <Badge key={k} label={`${k} ${v}`} />
          ))}
        </View>
        {data.skipped?.length ? (
          <TradingText muted size={tokens.textXs}>
            skipped: {data.skipped.map((x) => `${x.symbol} (${x.reason})`).join(", ")}
          </TradingText>
        ) : null}
      </Card>
      <Card>
        <GroupBars
          title={t("trading.bySymbol")}
          rows={Object.entries(
            res.trades.reduce<Record<string, { sum: number; n: number }>>((acc, tr) => {
              const e = acc[tr.symbol] ?? { sum: 0, n: 0 };
              acc[tr.symbol] = { sum: e.sum + tr.r, n: e.n + 1 };
              return acc;
            }, {})
          )
            .map(([key, v]) => ({ key, value: v.sum / v.n, sub: String(v.n) }))
            .sort((a, b) => b.value - a.value)}
        />
      </Card>
    </View>
  );
}

export default function TradingBacktestsScreen() {
  const { t, locale } = useI18n();
  const c = useColors();
  const { row } = useLayoutDir();
  const { run } = useApiMutation();
  const [preset, setPreset] = useState<Preset>("CRYPTO");
  const [years, setYears] = useState(4.5);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, loading, refresh } = useApiQuery(queryKeys.tradingBacktests, (cfg) => api.tradingBacktests(cfg));

  const start = async () => {
    setBusy(true);
    await run((cfg) => api.runTradingBacktest(cfg, { preset, years }), {
      onSuccess: (res) => {
        setOpenId(res.id);
        void queryClient.invalidateQueries({ queryKey: queryKeys.tradingAll });
      },
    });
    setBusy(false);
  };

  return (
    <Screen title={t("trading.hubBacktests")} subtitle={t("trading.backtestsSubtitle")} onRefresh={refresh} refreshing={loading}>
      <Card>
        <Row wrap>
          {(["CRYPTO", "STOCKS", "ALL"] as const).map((p) => (
            <Chip key={p} label={t(`trading.preset${p === "CRYPTO" ? "Crypto" : p === "STOCKS" ? "Stocks" : "All"}`)} active={preset === p} onPress={() => { setPreset(p); setYears(p === "CRYPTO" ? 4.5 : 2); }} />
          ))}
        </Row>
        <View style={{ height: 8 }} />
        <Row wrap>
          {[1, 2, 3, 4.5, 6].map((y) => (
            <Chip key={y} label={t("trading.years", { n: y })} active={years === y} onPress={() => setYears(y)} />
          ))}
        </Row>
        {preset !== "CRYPTO" ? (
          <TradingText muted size={tokens.textXs}>
            {t("trading.stocksHistoryNote")}
          </TradingText>
        ) : null}
        <View style={{ marginTop: 10 }}>
          <Btn label={busy ? t("trading.running") : t("trading.runBacktest")} onPress={() => void start()} disabled={busy} />
        </View>
      </Card>

      <SectionTitle>{t("trading.hubBacktests")}</SectionTitle>
      {!loading && !data?.length ? <EmptyState text={t("trading.noBacktests")} /> : null}
      {(data ?? []).map((bt) => {
        const passes = bt.gate?.checks?.every((x) => x.ok) ?? false;
        const open = openId === bt.id;
        return (
          <Card key={bt.id} style={open ? { borderColor: c.accent } : undefined}>
            <Pressable onPress={() => setOpenId(open ? null : bt.id)}>
              <View style={{ ...row, gap: 6, flexWrap: "wrap" }}>
                <Badge label={passes ? "GO" : "NO-GO"} tone={passes ? "good" : "warn"} />
                <TradingText bold>
                  {bt.symbols.length} · {bt.mode} · {bt.years}y
                </TradingText>
                <View style={{ flex: 1 }} />
                <TradingText muted size={tokens.textXs}>
                  {fmtDateTime(bt.created_at, locale)}
                </TradingText>
              </View>
              {bt.gate ? (
                <TradingText muted size={tokens.textXs}>
                  {t("trading.vsBuyHold", { ret: fmtPct(bt.gate.return_pct), bh: fmtPct(bt.gate.benchmark_return_pct) })} · {fmtR(bt.gate.stats.expectancy_r, 3)} · {bt.gate.stats.trades}
                </TradingText>
              ) : null}
            </Pressable>
            {open ? (
              <View style={{ marginTop: 10 }}>
                {bt.gate?.checks ? <GateChecklist checks={bt.gate.checks} /> : null}
                <View style={{ height: 10 }} />
                <BacktestDetail id={bt.id} />
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
