import React from "react";
import { View } from "react-native";
import { api } from "../src/api/resources";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { tokens } from "../src/theme";
import { queryKeys, useApiQuery } from "../src/query";
import { Card, EmptyState, Loading, Screen } from "../src/components/ui";
import { KpiGrid, SeriesChart } from "../src/components/trading/charts";
import { TradingText } from "../src/components/trading/blocks";
import { HealthBadge, fundKpis } from "../src/components/trading/fund";
import { fmtPct, fmtSignedUsd } from "@/lib/trading/format";

function Line({ label, value }: { label: string; value: string }) {
  const { row } = useLayoutDir();
  return (
    <View style={{ ...row, justifyContent: "space-between", paddingVertical: 4, gap: 8 }}>
      <TradingText>{label}</TradingText>
      {/* Numbers stay LTR so "+$1,200 · 1.1%" is not bidi-flipped. */}
      <TradingText bold style={{ writingDirection: "ltr" }}>
        {value}
      </TradingText>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <TradingText bold style={{ marginBottom: 6 }}>
        {title}
      </TradingText>
      {children}
    </Card>
  );
}

/** מערכת המסחר as a fund: NAV since the book started, per-strategy attribution, live vs the research model, health. */
export default function TradingFundScreen() {
  const { t } = useI18n();
  const { data: v, loading, refresh } = useApiQuery(queryKeys.tradingFund, (cfg) => api.tradingFund(cfg), { staleTime: 60_000 });

  return (
    <Screen title={t("trading.fund.title")} subtitle={t("trading.fund.subtitle", { date: v?.inception ?? "" })} onRefresh={refresh} refreshing={loading}>
      {!v ? <Loading /> : null}
      {v ? (
        <View style={{ gap: 12 }}>
          <Card>
            <HealthBadge health={v.health} />
          </Card>
          {!v.nav.length ? (
            <EmptyState text={t("trading.fund.empty")} />
          ) : (
            <>
              <Card>
                <KpiGrid items={[...fundKpis(v, t), { label: t("trading.fund.maxDrawdown"), value: v.max_drawdown === null ? "—" : fmtPct(-v.max_drawdown, 1) }]} />
                <SeriesChart title={t("trading.fund.navChart")} values={v.nav.map((x) => x.index)} baseline={100} format={(x) => x.toFixed(1)} />
                {v.nav.some((x) => x.model !== null) ? (
                  <SeriesChart title={t("trading.fund.modelChart")} values={v.nav.map((x) => x.model ?? 100)} baseline={100} format={(x) => x.toFixed(1)} />
                ) : null}
              </Card>
              <Section title={t("trading.fund.attribution")}>
                {v.attribution.map((a) => (
                  <Line key={a.strategy} label={a.strategy} value={`${fmtSignedUsd(a.itd_usd)} · ${fmtPct(a.itd_pct, 2)}`} />
                ))}
                <Line label={t("trading.fund.unattributed")} value={fmtSignedUsd(v.unattributed_itd)} />
              </Section>
              <Section title={t("trading.fund.tracking")}>
                {v.tracking.map((tr) => (
                  <Line
                    key={tr.grp}
                    label={tr.grp}
                    value={tr.stats.days ? `${fmtPct(tr.stats.live_cum, 2)} / ${fmtPct(tr.stats.model_cum, 2)} · TE ${fmtPct(tr.stats.te_annual, 1)}` : "—"}
                  />
                ))}
              </Section>
              {v.shortfall.length ? (
                <Section title={t("trading.fund.shortfall")}>
                  {v.shortfall.map((s) => (
                    <Line key={s.strategy} label={`${s.strategy} (${s.n})`} value={`${s.mean_bps.toFixed(1)} bps · ${fmtSignedUsd(s.usd)}`} />
                  ))}
                </Section>
              ) : null}
              {v.missed.length ? (
                <Section title={t("trading.fund.missed")}>
                  {v.missed.slice(0, 10).map((m) => (
                    <Line key={m.reason} label={m.reason} value={String(m.n)} />
                  ))}
                </Section>
              ) : null}
              <TradingText muted size={tokens.textXs}>
                {t("trading.fund.asOf", { date: v.as_of ?? "" })}
              </TradingText>
            </>
          )}
        </View>
      ) : null}
    </Screen>
  );
}
