import React, { useMemo } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { api } from "../../src/api/resources";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
import { queryClient, queryKeys, useApiMutation, useApiQuery } from "../../src/query";
import { Badge, Btn, Card, EmptyState, ErrorNote, KpiGridSkeleton, Screen, SectionTitle, SkeletonCard, confirmDelete } from "../../src/components/ui";
import { KpiGrid, SeriesChart } from "../../src/components/trading/charts";
import { PhaseGateCard, PositionCard, TradingHubLinks, TradingText, TriggerCard } from "../../src/components/trading/blocks";
import { fmtDateTime, fmtPct, fmtR, fmtSignedUsd, fmtUsd } from "@/lib/trading/format";

export default function TradingScreen() {
  const { t, locale } = useI18n();
  const c = useColors();
  const { row } = useLayoutDir();
  const { run } = useApiMutation();
  const router = useRouter();

  const overview = useApiQuery(queryKeys.tradingDashboard, (cfg) => api.tradingDashboard(cfg), { staleTime: 30_000 });
  const triggers = useApiQuery(queryKeys.tradingTriggersFeed, (cfg) => api.tradingTriggers(cfg), { staleTime: 30_000 });
  const events = useApiQuery(queryKeys.tradingEventsFeed, (cfg) => api.tradingEvents(cfg, 30), { staleTime: 30_000 });

  const data = overview.data;
  const triggerRows = triggers.data;
  const eventRows = events.data;
  const refreshing = overview.isFetching || triggers.isFetching || events.isFetching;

  const refresh = () => {
    void overview.refresh();
    void triggers.refresh();
    void events.refresh();
  };

  const control = (body: Record<string, unknown>) =>
    run((cfg) => api.tradingControl(cfg, body), {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.tradingAll });
        void queryClient.invalidateQueries({ queryKey: queryKeys.home });
      },
    });

  const equityValues = useMemo(() => (data?.equity_history ?? []).map((s) => s.equity), [data]);

  const alerts = data
    ? [
        data.settings.kill_switch_active ? `${t("trading.killSwitchActive")}: ${data.settings.kill_switch_reason ?? ""}` : null,
        data.account.halted_weekly ? t("trading.haltedWeekly") : data.account.halted_daily ? t("trading.haltedDaily") : null,
        data.settings.entries_paused ? t("trading.entriesPaused") : null,
      ].filter((x): x is string => Boolean(x))
    : [];

  return (
    <Screen title={t("trading.title")} subtitle={t("trading.subtitle")} onRefresh={refresh} refreshing={refreshing}>
      {data ? (
        <View style={{ ...row, gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <Badge label={`${t("trading.phase")}: ${t(`trading.phase_${data.settings.phase}`)}`} tone="accent" />
          <Badge label={t("trading.paramsVersion", { version: data.params.version })} />
          <View style={{ flex: 1 }} />
          <TradingText muted size={tokens.textXs}>
            {data.settings.last_tick_at ? t("trading.lastTick", { time: fmtDateTime(data.settings.last_tick_at, locale) }) : t("trading.neverTicked")}
          </TradingText>
        </View>
      ) : overview.loading ? (
        <View style={{ ...row, gap: 8, marginBottom: 10 }}>
          <SkeletonCard lines={1} />
        </View>
      ) : null}

      {overview.error && !data ? <ErrorNote message={overview.error} onRetry={refresh} /> : null}

      {alerts.map((a) => (
        <Card key={a} style={{ borderColor: c.warn, backgroundColor: c.warn + "18" }}>
          <TradingText bold color={c.warn}>
            {a}
          </TradingText>
        </Card>
      ))}

      <Card>
        <TradingText bold>{t("trading.searchCardTitle")}</TradingText>
        <TradingText muted size={tokens.textXs}>
          {t("trading.searchCardBody")}
        </TradingText>
        <View style={{ marginTop: 8 }}>
          <Btn label={t("trading.searchButton")} onPress={() => router.push("/trading-search?auto=1" as `/${string}`)} />
        </View>
      </Card>

      <TradingHubLinks />

      {data ? (
        <KpiGrid
          items={[
            { label: t("trading.equity"), value: fmtUsd(data.account.equity), hint: `${fmtSignedUsd(data.account.equity - data.account.starting_equity)}` },
            { label: t("trading.drawdown"), value: fmtPct(data.account.drawdown_pct), tone: data.account.drawdown_pct > 0.08 ? "warn" : "default", hint: `${t("trading.toKill")} ${fmtPct(data.account.kill_switch_distance_pct)}` },
            { label: t("trading.openRisk"), value: `${data.account.open_risk_r}R`, hint: `max ${data.envelope.MAX_TOTAL_OPEN_RISK_R}R`, tone: data.account.open_risk_r >= 4 ? "warn" : "default" },
            { label: t("trading.pnlDay"), value: fmtR(data.account.r_day), hint: fmtSignedUsd(data.account.pnl_day), tone: data.account.r_day >= 0 ? "good" : "warn" },
            { label: t("trading.pnlWeek"), value: fmtR(data.account.r_week), hint: fmtSignedUsd(data.account.pnl_week), tone: data.account.r_week >= 0 ? "good" : "warn" },
            { label: t("trading.pnlMonth"), value: fmtR(data.account.r_month), hint: fmtSignedUsd(data.account.pnl_month), tone: data.account.r_month >= 0 ? "good" : "warn" },
          ]}
        />
      ) : overview.loading ? (
        <KpiGridSkeleton />
      ) : null}

      {data ? (
        <PhaseGateCard
          gate={data.gate}
          onReview={(key) => void control({ action: "mark_review", key })}
          onAdvance={() =>
            data.gate.next &&
            confirmDelete(t("trading.advanceConfirm", { next: t(`trading.phase_${data.gate.next}`) }), () => void control({ action: "set_phase", phase: data.gate.next, confirm: true }), t("common.save"), t("common.cancel"))
          }
        />
      ) : overview.loading ? (
        <SkeletonCard lines={4} />
      ) : null}

      <SectionTitle>{t("trading.positions")}</SectionTitle>
      {data ? (
        <>
          <View style={{ ...row, gap: 8, marginBottom: 8 }}>
            <Btn small variant="ghost" label={data.settings.entries_paused ? t("trading.resume") : t("trading.pause")} onPress={() => void control({ action: data.settings.entries_paused ? "resume_entries" : "pause_entries" })} />
            {data.positions.length ? (
              <Btn small variant="warn" label={t("trading.closeAll")} onPress={() => confirmDelete(t("trading.closeAllConfirm"), () => void control({ action: "close_all", confirm: true }), t("trading.closeAll"), t("common.cancel"))} />
            ) : null}
            <View style={{ flex: 1 }} />
            {data.shadow_open ? (
              <TradingText muted size={tokens.textXs}>
                {t("trading.shadowOpen", { count: data.shadow_open })}
              </TradingText>
            ) : null}
          </View>
          {data.positions.length === 0 ? <EmptyState text={t("trading.noPositions")} /> : null}
          {data.positions.map((p) => (
            <PositionCard
              key={p.id}
              p={p}
              onClose={() => confirmDelete(t("trading.closeConfirm", { symbol: p.symbol }), () => void control({ action: "close_position", trade_id: p.id, confirm: true }), t("trading.close"), t("common.cancel"))}
            />
          ))}
          {data.other_positions?.length ? (
            <>
              <SectionTitle>{t("trading.otherPositions")}</SectionTitle>
              <TradingText muted size={tokens.textXs}>
                {t("trading.otherPositionsHint")}
              </TradingText>
              {data.other_positions.map((p) => (
                <PositionCard
                  key={p.id}
                  p={p}
                  onClose={() => confirmDelete(t("trading.closeConfirm", { symbol: p.symbol }), () => void control({ action: "close_position", trade_id: p.id, confirm: true }), t("trading.close"), t("common.cancel"))}
                />
              ))}
            </>
          ) : null}
        </>
      ) : overview.loading ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : null}

      {data && equityValues.length > 1 ? (
        <Card>
          <SeriesChart values={equityValues} title={t("trading.equityCurve")} format={(v) => fmtUsd(v)} />
        </Card>
      ) : overview.loading && !data ? (
        <SkeletonCard lines={1} />
      ) : null}

      <SectionTitle>{t("trading.triggers")}</SectionTitle>
      {triggers.error && !triggerRows ? <ErrorNote message={triggers.error} onRetry={() => void triggers.refresh()} /> : null}
      {triggerRows ? (
        <>
          {triggerRows.length === 0 ? <EmptyState text={t("trading.noTriggers")} /> : null}
          {triggerRows.slice(0, 12).map((tr) => (
            <TriggerCard key={tr.id} tr={tr} />
          ))}
        </>
      ) : triggers.loading ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : null}

      <SectionTitle>{t("trading.events")}</SectionTitle>
      {events.error && !eventRows ? <ErrorNote message={events.error} onRetry={() => void events.refresh()} /> : null}
      {eventRows ? (
        <Card>
          {eventRows.slice(0, 15).map((e) => (
            <View key={e.id} style={{ ...row, gap: 8, alignItems: "flex-start", paddingVertical: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 6, backgroundColor: e.severity === "critical" ? c.warn : e.severity === "warn" ? c.accent2 : c.muted }} />
              <View style={{ flex: 1 }}>
                <TradingText size={tokens.textXs}>{e.message}</TradingText>
                <TradingText muted size={10}>
                  {e.kind} · {fmtDateTime(e.created_at, locale)}
                </TradingText>
              </View>
            </View>
          ))}
        </Card>
      ) : events.loading ? (
        <SkeletonCard lines={4} />
      ) : null}
    </Screen>
  );
}
