import React, { useState } from "react";
import { Switch, View } from "react-native";
import { api } from "../src/api/resources";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { queryClient, queryKeys, useApiMutation, useApiQuery } from "../src/query";
import { Badge, Btn, Card, Chip, Input, Loading, Row, Screen, SectionTitle, confirmDelete } from "../src/components/ui";
import { TradingText } from "../src/components/trading/blocks";
import { fmtDateTime, fmtPct, fmtR } from "@/lib/trading/format";

const EVENT_KINDS = ["CPI", "FOMC", "EARNINGS", "TOKEN_UNLOCK", "OTHER_MACRO"] as const;

/** Label at the reading start, switch at the far end — explicit so RN-web's RTL flip can't misplace the thumb. */
function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { rtl } = useLayoutDir();
  return (
    <View style={{ flexDirection: rtl ? "row-reverse" : "row", direction: "ltr", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
      <View style={{ flex: 1 }}>
        <TradingText bold>{label}</TradingText>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export default function TradingControlScreen() {
  const { t, locale } = useI18n();
  const c = useColors();
  const { row } = useLayoutDir();
  const { run } = useApiMutation();
  const { data: dash, refresh: refreshDash, loading } = useApiQuery(queryKeys.tradingDashboard, (cfg) => api.tradingDashboard(cfg));
  const { data: uni, refresh: refreshUni } = useApiQuery(queryKeys.tradingUniverse, (cfg) => api.tradingUniverse(cfg));
  const { data: paramSets, refresh: refreshParams } = useApiQuery(queryKeys.tradingParamSets, (cfg) => api.tradingParamSets(cfg));
  const [phrase, setPhrase] = useState("");
  const [evKind, setEvKind] = useState<(typeof EVENT_KINDS)[number]>("CPI");
  const [evDate, setEvDate] = useState("");
  const [evSymbol, setEvSymbol] = useState("");
  const [calBusy, setCalBusy] = useState(false);

  const refreshAll = () => {
    void refreshDash();
    void refreshUni();
    void refreshParams();
  };
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.tradingAll });
  const control = (body: Record<string, unknown>) => run((cfg) => api.tradingControl(cfg, body), { onSuccess: invalidate });

  if (!dash) return <Screen title={t("trading.hubControl")}>{loading ? <Loading /> : null}</Screen>;
  const { settings, envelope } = dash;

  const envelopeRows: [string, string][] = [
    ["MAX_RISK_PER_TRADE", `crypto ${fmtPct(envelope.MAX_RISK_PER_TRADE.CRYPTO_ALT)} · stocks ${fmtPct(envelope.MAX_RISK_PER_TRADE.STOCK)}`],
    ["MIN_RR_RATIO", `${envelope.MIN_RR_RATIO}`],
    ["MAX_CONCURRENT_POSITIONS", `${envelope.MAX_CONCURRENT_POSITIONS}`],
    ["MAX_TOTAL_OPEN_RISK", `${envelope.MAX_TOTAL_OPEN_RISK_R}R`],
    ["MAX_CORRELATED_POSITIONS", `${envelope.MAX_CORRELATED_POSITIONS} (ρ ≥ ${envelope.CORRELATION_THRESHOLD})`],
    ["DAILY_LOSS_HALT", fmtR(envelope.DAILY_LOSS_HALT_R, 0)],
    ["WEEKLY_LOSS_HALT", fmtR(envelope.WEEKLY_LOSS_HALT_R, 0)],
    ["MASTER_KILL_SWITCH", `−${fmtPct(envelope.MASTER_KILL_SWITCH_DD, 0)}`],
    ["MAX_ASSET_EXPOSURE", fmtPct(envelope.MAX_ASSET_EXPOSURE, 0)],
    ["AGENT_RISK_MULTIPLIERS", envelope.AGENT_RISK_MULTIPLIERS.join(" / ")],
  ];

  return (
    <Screen title={t("trading.hubControl")} subtitle={t("trading.controlSubtitle")} onRefresh={refreshAll} refreshing={loading}>
      <SectionTitle>{t("trading.liveControls")}</SectionTitle>
      <Card>
        <SwitchRow label={settings.entries_paused ? t("trading.entriesPaused") : t("trading.resume")} value={!settings.entries_paused} onChange={(v) => void control({ action: v ? "resume_entries" : "pause_entries" })} />
        <SwitchRow label={t("trading.intraday")} value={settings.intraday_enabled} onChange={(v) => void control({ action: "set_intraday", enabled: v })} />
        <SwitchRow label={t("trading.agentLayer")} value={settings.agent_enabled} onChange={(v) => void control({ action: "set_agent", enabled: v })} />
        <TradingText bold>{t("trading.riskScale", { v: settings.risk_scale })}</TradingText>
        <TradingText muted size={tokens.textXs}>
          {t("trading.riskScaleNote")}
        </TradingText>
        <View style={{ marginTop: 6 }}>
          <Row wrap>
            {[0.25, 0.5, 0.75, 1].map((v) => (
              <Chip key={v} label={`×${v}`} active={settings.risk_scale === v} onPress={() => void control({ action: "set_risk_scale", value: v })} />
            ))}
          </Row>
        </View>
        {settings.pending_risk_scale !== null && settings.pending_risk_scale_at ? (
          <TradingText size={tokens.textXs} color={c.accent2}>
            {t("trading.pendingRaise", { v: settings.pending_risk_scale, at: fmtDateTime(settings.pending_risk_scale_at, locale) })}
          </TradingText>
        ) : null}
      </Card>

      {settings.kill_switch_active ? (
        <Card style={{ borderColor: c.warn }}>
          <TradingText bold color={c.warn}>
            {t("trading.killSwitchActive")}: {settings.kill_switch_reason}
          </TradingText>
          <Input value={phrase} onChangeText={setPhrase} placeholder={t("trading.rearmPrompt")} autoCapitalize="characters" />
          <Btn variant="warn" label={t("trading.rearm")} disabled={phrase !== "ARM"} onPress={() => void control({ action: "rearm_kill_switch", phrase, confirm: true })} />
        </Card>
      ) : null}

      <SectionTitle>{t("trading.envelope")}</SectionTitle>
      <Card>
        <TradingText muted size={tokens.textXs}>
          {t("trading.envelopeNote")}
        </TradingText>
        {envelopeRows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.border, direction: "ltr" }}>
            <TradingText muted size={tokens.textXs}>
              {k}
            </TradingText>
            <TradingText bold size={tokens.textXs}>
              {v}
            </TradingText>
          </View>
        ))}
      </Card>

      <SectionTitle>{t("trading.calibration")}</SectionTitle>
      <Card>
        <TradingText muted size={tokens.textXs}>
          {t("trading.calibrationNote")}
        </TradingText>
        <TradingText>{t("trading.activeParams", { v: dash.params.version })}</TradingText>
        {dash.params_locked_until ? (
          <TradingText muted size={tokens.textXs}>
            {t("trading.lockedUntil", { d: dash.params_locked_until.slice(0, 10) })}
          </TradingText>
        ) : null}
        <TradingText muted size={tokens.textXs}>
          RSI {dash.params.rsi_low}–{dash.params.rsi_high} · ADX &gt; {dash.params.adx_min} · stop {dash.params.atr_stop_mult}×ATR · trail {dash.params.trail_atr_mult}×ATR
        </TradingText>
        <View style={{ marginTop: 8 }}>
          <Btn
            small
            variant="ghost"
            label={calBusy ? t("trading.running") : t("trading.proposeCalibration")}
            disabled={calBusy}
            onPress={async () => {
              setCalBusy(true);
              await run((cfg) => api.tradingCalibration(cfg, { action: "propose", preset: "CRYPTO", years: 4 }), { onSuccess: invalidate });
              setCalBusy(false);
            }}
          />
        </View>
        {(paramSets ?? []).map((ps) => (
          <View key={ps.id} style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border }}>
            <View style={{ ...row, gap: 6, flexWrap: "wrap" }}>
              <Badge label={ps.status} tone={ps.status === "ACTIVE" ? "good" : ps.status === "PROPOSED" ? "accent" : "default"} />
              <TradingText bold size={tokens.textXs}>
                {ps.version}
              </TradingText>
              {ps.evidence ? <Badge label={ps.evidence.recommend ? t("trading.recommended") : t("trading.notRecommended")} tone={ps.evidence.recommend ? "good" : "warn"} /> : null}
            </View>
            {ps.evidence ? (
              <TradingText muted size={tokens.textXs}>
                {t("trading.oosEvidence", { p: fmtR(ps.evidence.oos_total_r, 1), c: fmtR(ps.evidence.current_oos_total_r, 1) })}
              </TradingText>
            ) : null}
            {ps.status === "PROPOSED" ? (
              <View style={{ ...row, gap: 8, marginTop: 6 }}>
                <Btn small label={t("trading.approve")} onPress={() => confirmDelete(t("trading.approveConfirm"), () => void run((cfg) => api.tradingCalibration(cfg, { action: "approve", id: ps.id, confirm: true }), { onSuccess: invalidate }), t("trading.approve"), t("common.cancel"))} />
                <Btn small variant="ghost" label={t("trading.reject")} onPress={() => void run((cfg) => api.tradingCalibration(cfg, { action: "reject", id: ps.id, confirm: true }), { onSuccess: invalidate })} />
              </View>
            ) : null}
          </View>
        ))}
      </Card>

      <SectionTitle>{t("trading.universe")}</SectionTitle>
      {(uni?.universe ?? []).map((u) => (
        <Card key={u.symbol}>
          <SwitchRow label={u.symbol} value={u.manual_enabled} onChange={(v) => void control({ action: "set_symbol_enabled", symbol: u.symbol, enabled: v })} />
          <View style={{ ...row, gap: 6, marginBottom: 4 }}>
            <Badge label={u.asset_class} />
            <Badge label={t(`trading.eligibility_${u.eligibility}`)} tone={u.eligibility === "ACTIVE" ? "good" : "warn"} />
          </View>
          <TradingText muted size={tokens.textXs}>
            {u.bucket_id ?? "—"}
            {u.metrics ? ` · ATR ${fmtPct(Number(u.metrics.atr_pct))} · $${Math.round(Number(u.metrics.avg_dollar_volume_30d) / 1e6)}M/d` : ""}
          </TradingText>
          {u.screen_failures.length ? (
            <TradingText size={tokens.textXs} color={c.warn}>
              {t("trading.screenFailed", { f: u.screen_failures.join(", ") })}
            </TradingText>
          ) : null}
          {u.eligibility_note ? (
            <TradingText muted size={tokens.textXs}>
              {u.eligibility_note}
            </TradingText>
          ) : null}
        </Card>
      ))}

      <SectionTitle>{t("trading.calendar")}</SectionTitle>
      <Card>
        <Row wrap>
          {EVENT_KINDS.map((k) => (
            <Chip key={k} label={k} active={evKind === k} onPress={() => setEvKind(k)} />
          ))}
        </Row>
        <View style={{ height: 8 }} />
        <Input value={evDate} onChangeText={setEvDate} placeholder={t("trading.eventDate")} autoCapitalize="none" />
        {evKind === "EARNINGS" || evKind === "TOKEN_UNLOCK" ? <Input value={evSymbol} onChangeText={setEvSymbol} placeholder={t("trading.eventSymbol")} autoCapitalize="characters" /> : null}
        <Btn
          small
          label={t("trading.addEvent")}
          disabled={!/^\d{4}-\d{2}-\d{2}$/.test(evDate)}
          onPress={() => {
            void control({ action: "add_calendar_event", kind: evKind, date: evDate, symbol: evSymbol || null });
            setEvDate("");
            setEvSymbol("");
          }}
        />
        {(uni?.calendar ?? []).slice(0, 20).map((e) => (
          <TradingText key={e.id} muted size={tokens.textXs}>
            {e.date} · {e.kind}
            {e.symbol ? ` · ${e.symbol}` : ""}
            {e.note ? ` · ${e.note}` : ""}
          </TradingText>
        ))}
      </Card>
    </Screen>
  );
}
