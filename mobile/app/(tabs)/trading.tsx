import React, { useMemo } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { api } from "../../src/api/resources";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
import { queryClient, queryKeys, useApiMutation, useApiQuery } from "../../src/query";
import { Badge, Btn, Card, EmptyState, ErrorNote, Loading, Screen, SectionTitle, confirmDelete } from "../../src/components/ui";
import { KpiGrid, SeriesChart } from "../../src/components/trading/charts";
import { PhaseGateCard, PositionCard, TradingHubLinks, TradingText, TriggerCard } from "../../src/components/trading/blocks";
import { fmtDateTime, fmtPct, fmtR, fmtSignedUsd, fmtUsd } from "@/lib/trading/format";

export default function TradingScreen() {
  const { t, locale } = useI18n();
  const c = useColors();
  const { row } = useLayoutDir();
  const { run } = useApiMutation();
  const router = useRouter();
  const { data, loading, error, refresh } = useApiQuery(queryKeys.tradingDashboard, (cfg) => api.tradingDashboard(cfg), { staleTime: 30_000 });

  const control = (body: Record<string, unknown>) =>
    run((cfg) => api.tradingControl(cfg, body), {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.tradingAll });
        void queryClient.invalidateQueries({ queryKey: queryKeys.home });
      },
    });

  const equityValues = useMemo(() => (data?.equity_history ?? []).map((s) => s.equity), [data]);

  if (!data) {
    return (
      <Screen title={t("trading.title")} subtitle={t("trading.subtitle")} onRefresh={refresh} refreshing={loading}>
        {error ? <ErrorNote message={error} onRetry={refresh} /> : <Loading />}
      </Screen>
    );
  }
  const { settings, account, gate } = data;
  const alerts = [
    settings.kill_switch_active ? `${t("trading.killSwitchActive")}: ${settings.kill_switch_reason ?? ""}` : null,
    account.halted_weekly ? t("trading.haltedWeekly") : account.halted_daily ? t("trading.haltedDaily") : null,
    settings.entries_paused ? t("trading.entriesPaused") : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <Screen title={t("trading.title")} subtitle={t("trading.subtitle")} onRefresh={refresh} refreshing={loading}>
      <View style={{ ...row, gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Badge label={`${t("trading.phase")}: ${t(`trading.phase_${settings.phase}`)}`} tone="accent" />
        <Badge label={t("trading.paramsVersion", { version: data.params.version })} />
        <View style={{ flex: 1 }} />
        <TradingText muted size={tokens.textXs}>
          {settings.last_tick_at ? t("trading.lastTick", { time: fmtDateTime(settings.last_tick_at, locale) }) : t("trading.neverTicked")}
        </TradingText>
      </View>

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

      <KpiGrid
        items={[
          { label: t("trading.equity"), value: fmtUsd(account.equity), hint: `${fmtSignedUsd(account.equity - account.starting_equity)}` },
          { label: t("trading.drawdown"), value: fmtPct(account.drawdown_pct), tone: account.drawdown_pct > 0.08 ? "warn" : "default", hint: `${t("trading.toKill")} ${fmtPct(account.kill_switch_distance_pct)}` },
          { label: t("trading.openRisk"), value: `${account.open_risk_r}R`, hint: `max ${data.envelope.MAX_TOTAL_OPEN_RISK_R}R`, tone: account.open_risk_r >= 4 ? "warn" : "default" },
          { label: t("trading.pnlDay"), value: fmtR(account.r_day), hint: fmtSignedUsd(account.pnl_day), tone: account.r_day >= 0 ? "good" : "warn" },
          { label: t("trading.pnlWeek"), value: fmtR(account.r_week), hint: fmtSignedUsd(account.pnl_week), tone: account.r_week >= 0 ? "good" : "warn" },
          { label: t("trading.pnlMonth"), value: fmtR(account.r_month), hint: fmtSignedUsd(account.pnl_month), tone: account.r_month >= 0 ? "good" : "warn" },
        ]}
      />

      <PhaseGateCard
        gate={gate}
        onReview={(key) => void control({ action: "mark_review", key })}
        onAdvance={() =>
          gate.next &&
          confirmDelete(t("trading.advanceConfirm", { next: t(`trading.phase_${gate.next}`) }), () => void control({ action: "set_phase", phase: gate.next, confirm: true }), t("common.save"), t("common.cancel"))
        }
      />

      <SectionTitle>{t("trading.positions")}</SectionTitle>
      <View style={{ ...row, gap: 8, marginBottom: 8 }}>
        <Btn small variant="ghost" label={settings.entries_paused ? t("trading.resume") : t("trading.pause")} onPress={() => void control({ action: settings.entries_paused ? "resume_entries" : "pause_entries" })} />
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

      {/* close_all only touches account trades, and the dashboard used to drop
          everything else — so leftover SHADOW rows from an earlier phase stayed
          open with no way to reach them from the app. */}
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

      {equityValues.length > 1 ? (
        <Card>
          <SeriesChart values={equityValues} title={t("trading.equityCurve")} format={(v) => fmtUsd(v)} />
        </Card>
      ) : null}

      <SectionTitle>{t("trading.triggers")}</SectionTitle>
      {data.triggers.length === 0 ? <EmptyState text={t("trading.noTriggers")} /> : null}
      {data.triggers.slice(0, 12).map((tr) => (
        <TriggerCard key={tr.id} tr={tr} />
      ))}

      <SectionTitle>{t("trading.events")}</SectionTitle>
      <Card>
        {data.events.slice(0, 15).map((e) => (
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
    </Screen>
  );
}
