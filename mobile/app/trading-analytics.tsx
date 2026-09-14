import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { api } from "../src/api/resources";
import { useI18n } from "../src/i18n";
import { useColors, tokens } from "../src/theme";
import { queryKeys, useApiQuery } from "../src/query";
import { Badge, Card, Chip, Loading, Row, Screen, SectionTitle } from "../src/components/ui";
import { GroupBars, KpiGrid, RHistogram, SeriesChart } from "../src/components/trading/charts";
import { TradingText } from "../src/components/trading/blocks";
import { fmtPct, fmtR, fmtUsd } from "@/lib/trading/format";
import type { GroupStat } from "@/lib/trading/metrics";

const toBars = (groups: GroupStat[], max = 12) =>
  groups.slice(0, max).map((g) => ({ key: g.key, value: g.stats.expectancy_r, sub: `${g.stats.trades}` }));

export default function TradingAnalyticsScreen() {
  const { t } = useI18n();
  const c = useColors();
  const [execution, setExecution] = useState("ALL");
  const [track, setTrack] = useState("AGENT");
  const [days, setDays] = useState(0);
  const scope = useMemo(() => ({ execution, track, days }), [execution, track, days]);
  const { data, loading, refresh } = useApiQuery(queryKeys.tradingAnalytics(scope), (cfg) => api.tradingAnalytics(cfg, scope));
  const s = data?.stats;
  const av = data?.agent_value;

  return (
    <Screen title={t("trading.hubAnalytics")} subtitle={t("trading.analyticsSubtitle")} onRefresh={refresh} refreshing={loading}>
      <View style={{ gap: 8, marginBottom: 10 }}>
        <Row wrap>
          {["ALL", "SHADOW", "PAPER"].map((e) => (
            <Chip key={e} label={e === "ALL" ? t("trading.filterAll") : e} active={execution === e} onPress={() => setExecution(e)} />
          ))}
        </Row>
        <Row wrap>
          <Chip label={t("trading.trackAgent")} active={track === "AGENT"} onPress={() => setTrack("AGENT")} />
          <Chip label={t("trading.trackDeterministic")} active={track === "DETERMINISTIC"} onPress={() => setTrack("DETERMINISTIC")} />
        </Row>
        <Row wrap>
          {[0, 7, 30, 90, 365].map((d) => (
            <Chip key={d} label={d === 0 ? t("trading.daysAll") : `${d}d`} active={days === d} onPress={() => setDays(d)} />
          ))}
        </Row>
      </View>

      {!data ? <Loading /> : null}
      {s ? (
        <>
          <KpiGrid
            items={[
              { label: t("trading.trades"), value: String(s.trades) },
              { label: t("trading.winRate"), value: fmtPct(s.win_rate), hint: t("trading.winRateCi", { lo: fmtPct(s.win_rate_ci[0], 0), hi: fmtPct(s.win_rate_ci[1], 0) }) },
              { label: t("trading.expectancy"), value: fmtR(s.expectancy_r), tone: s.expectancy_r >= 0 ? "good" : "warn", hint: s.sqn !== null ? `SQN ${s.sqn}` : undefined },
              { label: t("trading.totalR"), value: fmtR(s.total_r, 1), tone: s.total_r >= 0 ? "good" : "warn" },
              { label: t("trading.profitFactor"), value: s.profit_factor === null ? "∞" : String(s.profit_factor) },
              { label: t("trading.maxDd"), value: `${s.max_drawdown_r}R`, hint: `${t("trading.streaks")} +${s.max_win_streak} / −${s.max_loss_streak}` },
            ]}
          />

          {data.r_curve.length > 1 ? (
            <Card>
              <SeriesChart values={data.r_curve.map((p) => p.cum_r)} baseline={0} title={t("trading.equityCurve")} format={(v) => fmtR(v, 1)} />
            </Card>
          ) : null}

          <Card>
            <RHistogram bins={data.r_distribution} title={t("trading.rDistribution")} />
          </Card>

          {av ? (
            <>
              <SectionTitle>{t("trading.agentValue")}</SectionTitle>
              <Card style={{ borderColor: av.verdict === "DESTROYS_VALUE" ? c.warn : av.verdict === "ADDS_VALUE" ? c.good : c.border }}>
                <Badge label={t(`trading.agentValue_${av.verdict}`, { n: av.triggers })} tone={av.verdict === "ADDS_VALUE" ? "good" : av.verdict === "DESTROYS_VALUE" ? "warn" : "default"} />
                <View style={{ marginTop: 8 }}>
                  <TradingText>{t("trading.agentVsDet", { agent: fmtR(av.agent_expectancy_r, 3), det: fmtR(av.deterministic_expectancy_r, 3) })}</TradingText>
                  <TradingText muted size={tokens.textXs}>
                    Δ {fmtR(av.diff_r, 3)}
                    {av.diff_ci90 ? ` · CI90 [${fmtR(av.diff_ci90[0], 3)}, ${fmtR(av.diff_ci90[1], 3)}]` : ""} · skip {fmtPct(av.agent_skip_rate, 0)}
                  </TradingText>
                  <TradingText muted size={tokens.textXs}>
                    {t("trading.skipped", { w: av.skipped_winners, l: av.skipped_losers })}
                  </TradingText>
                </View>
                <View style={{ marginTop: 10 }}>
                  <GroupBars
                    title={t("trading.byConviction")}
                    rows={av.by_conviction.filter((x) => x.triggers > 0).map((x) => ({ key: `${x.conviction}/5`, value: x.deterministic_expectancy_r, sub: String(x.triggers) }))}
                  />
                </View>
              </Card>
            </>
          ) : null}

          <SectionTitle>{t("trading.execQuality")}</SectionTitle>
          <KpiGrid
            items={[
              { label: "avg MFE", value: fmtR(data.avg_mfe_r, 2), tone: "good" },
              { label: "avg MAE", value: fmtR(data.avg_mae_r, 2), tone: "warn" },
              { label: "hold", value: `${data.avg_hold_hours}h` },
              { label: t("trading.slippage"), value: data.avg_slippage_bps === null ? "—" : `${data.avg_slippage_bps}bps` },
              { label: t("trading.fees"), value: fmtUsd(data.total_fees) },
              { label: t("trading.gapped"), value: String(data.gaps_through_stop), tone: data.gaps_through_stop ? "warn" : "default" },
            ]}
          />

          {[
            { title: t("trading.bySymbol"), rows: data.by_symbol },
            { title: t("trading.byBucket"), rows: data.by_bucket },
            { title: t("trading.byExit"), rows: data.by_exit_reason },
            { title: t("trading.byWeekday"), rows: data.by_weekday },
            { title: "Mode / class", rows: [...data.by_mode, ...data.by_asset_class] },
          ]
            .filter((g) => g.rows.length)
            .map((g) => (
              <Card key={g.title}>
                <GroupBars title={g.title} rows={toBars(g.rows)} />
              </Card>
            ))}
        </>
      ) : null}
    </Screen>
  );
}
