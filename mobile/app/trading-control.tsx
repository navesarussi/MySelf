import React, { useState } from "react";
import { Switch, View } from "react-native";
import { api } from "../src/api/resources";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { queryClient, queryKeys, useApiMutation, useApiQuery } from "../src/query";
import { Badge, Btn, Card, Chip, CollapsibleSection, ErrorNote, Input, Row, Screen, SkeletonCard, confirmDelete } from "../src/components/ui";
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
  const { data: dash, refresh: refreshDash, loading: dashLoading, isFetching: dashFetching } = useApiQuery(queryKeys.tradingDashboard, (cfg) => api.tradingDashboard(cfg));
  const { data: broker, refresh: refreshBroker, loading: brokerLoading, error: brokerError } = useApiQuery(queryKeys.tradingBroker, (cfg) => api.tradingBroker(cfg));
  const { data: uni, refresh: refreshUni, loading: uniLoading } = useApiQuery(queryKeys.tradingUniverse, (cfg) => api.tradingUniverse(cfg));
  const { data: paramSets, refresh: refreshParams, loading: paramsLoading } = useApiQuery(queryKeys.tradingParamSets, (cfg) => api.tradingParamSets(cfg));
  const { data: learning, refresh: refreshLearning, loading: learningLoading } = useApiQuery(queryKeys.tradingLearning, (cfg) => api.tradingLearning(cfg));
  const [phrase, setPhrase] = useState("");
  const [evKind, setEvKind] = useState<(typeof EVENT_KINDS)[number]>("CPI");
  const [evDate, setEvDate] = useState("");
  const [evSymbol, setEvSymbol] = useState("");
  const [calBusy, setCalBusy] = useState(false);

  const refreshAll = () => {
    void refreshDash();
    void refreshBroker();
    void refreshUni();
    void refreshParams();
    void refreshLearning();
  };
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.tradingAll });
  const control = (body: Record<string, unknown>) => run((cfg) => api.tradingControl(cfg, body), { onSuccess: invalidate });

  const settings = dash?.settings;
  const envelope = dash?.envelope;

  // The live account envelope, in % of equity (RISK_ENVELOPE.ACCOUNT_*); the R-count limits are research-only.
  const envelopeRows: [string, string][] = envelope
    ? [
        [t("trading.envMaxRisk"), `${t("trading.assetCrypto")} ${fmtPct(envelope.MAX_RISK_PER_TRADE.CRYPTO_ALT)} · ${t("trading.assetStock")} ${fmtPct(envelope.MAX_RISK_PER_TRADE.STOCK)}`],
        [t("trading.envMaxPositions"), `${envelope.ACCOUNT_MAX_POSITIONS ?? envelope.MAX_CONCURRENT_POSITIONS}`],
        [t("trading.envMaxOpenRisk"), fmtPct(envelope.ACCOUNT_MAX_OPEN_RISK_PCT ?? 0.08, 0)],
        [t("trading.envDailyHalt"), fmtPct(envelope.DAILY_LOSS_HALT_PCT ?? -0.03, 0)],
        [t("trading.envWeeklyHalt"), fmtPct(envelope.WEEKLY_LOSS_HALT_PCT ?? -0.05, 0)],
        [t("trading.envKillSwitch"), `−${fmtPct(envelope.MASTER_KILL_SWITCH_DD, 0)}`],
        [t("trading.envMaxNotional"), fmtPct(envelope.MAX_ASSET_EXPOSURE, 0)],
      ]
    : [];
  const envelopeSummary = envelope
    ? `${envelope.ACCOUNT_MAX_POSITIONS ?? envelope.MAX_CONCURRENT_POSITIONS} · ${fmtPct(envelope.ACCOUNT_MAX_OPEN_RISK_PCT ?? 0.08, 0)} · −${fmtPct(envelope.MASTER_KILL_SWITCH_DD, 0)}`
    : null;

  return (
    <Screen title={t("trading.hubControl")} subtitle={t("trading.controlSubtitle")} onRefresh={refreshAll} refreshing={dashFetching}>
      <CollapsibleSection id="trading.control.demo" title={t("trading.demoTitle")} defaultOpen={true}>
      {brokerError && !broker ? <ErrorNote message={brokerError} onRetry={() => void refreshBroker()} /> : null}
      {broker ? (
        <Card style={broker.connected ? { borderColor: c.good } : undefined}>
          <TradingText muted size={tokens.textXs}>
            {t("trading.demoNote")}
          </TradingText>
          <View style={{ marginTop: 8 }}>
            {!broker.configured ? (
              <TradingText color={c.warn}>{t("trading.demoNotConfigured")}</TradingText>
            ) : broker.connected ? (
              <TradingText bold color={c.good}>
                {t("trading.demoConnected", { equity: Math.round(broker.equity ?? 0).toLocaleString("en-US") })}
              </TradingText>
            ) : (
              <TradingText color={c.warn}>{t("trading.demoError", { error: broker.error ?? "?" })}</TradingText>
            )}
          </View>
          {settings ? (
            <View style={{ ...row, gap: 8, marginTop: 10 }}>
              {settings.execution_venue === "ALPACA_PAPER" && settings.phase === "PAPER" ? (
                <>
                  <Badge label={t("trading.demoActive")} tone="good" />
                  <View style={{ flex: 1 }} />
                  <Btn small variant="warn" label={t("trading.stopDemo")} onPress={() => void control({ action: "stop_demo" })} />
                </>
              ) : (
                <Btn
                  label={t("trading.startDemo")}
                  disabled={!broker.connected}
                  onPress={() => confirmDelete(t("trading.startDemoConfirm"), () => void control({ action: "start_demo", confirm: true }), t("trading.startDemo"), t("common.cancel"))}
                />
              )}
            </View>
          ) : null}
        </Card>
      ) : brokerLoading ? (
        <SkeletonCard lines={3} />
      ) : null}

      </CollapsibleSection>

      <CollapsibleSection id="trading.control.live" title={t("trading.liveControls")} defaultOpen={true}>
      {settings ? (
        <Card>
          <SwitchRow label={settings.entries_paused ? t("trading.entriesPaused") : t("trading.resume")} value={!settings.entries_paused} onChange={(v) => void control({ action: v ? "resume_entries" : "pause_entries" })} />
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
      ) : dashLoading ? (
        <SkeletonCard lines={4} />
      ) : null}

      </CollapsibleSection>

      {settings?.kill_switch_active ? (
        <Card style={{ borderColor: c.warn }}>
          <TradingText bold color={c.warn}>
            {t("trading.killSwitchActive")}: {settings.kill_switch_reason}
          </TradingText>
          <Input value={phrase} onChangeText={setPhrase} placeholder={t("trading.rearmPrompt")} autoCapitalize="characters" />
          <Btn variant="warn" label={t("trading.rearm")} disabled={phrase !== "ARM"} onPress={() => void control({ action: "rearm_kill_switch", phrase, confirm: true })} />
        </Card>
      ) : null}

      <CollapsibleSection id="trading.control.envelope" title={t("trading.envelope")} defaultOpen={true} summary={envelopeSummary}>
      {envelope ? (
        <Card>
          <TradingText muted size={tokens.textXs}>
            {t("trading.envelopeNote")}
          </TradingText>
          {envelopeRows.map(([k, v]) => (
            <View key={k} style={{ ...row, justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <TradingText muted size={tokens.textXs}>
                  {k}
                </TradingText>
              </View>
              <TradingText bold size={tokens.textXs} style={{ writingDirection: "ltr" }}>
                {v}
              </TradingText>
            </View>
          ))}
        </Card>
      ) : dashLoading ? (
        <SkeletonCard lines={5} />
      ) : null}

      </CollapsibleSection>

      <CollapsibleSection id="trading.control.calibration" title={t("trading.calibration")} defaultOpen={false}>
      <Card>
        <TradingText muted size={tokens.textXs}>
          {t("trading.calibrationNote")}
        </TradingText>
        {dash ? (
          <>
            <TradingText>{t("trading.activeParams", { v: dash.params.version })}</TradingText>
            {dash.params_locked_until ? (
              <TradingText muted size={tokens.textXs}>
                {t("trading.lockedUntil", { d: dash.params_locked_until.slice(0, 10) })}
              </TradingText>
            ) : null}
            <TradingText muted size={tokens.textXs}>
              {t("trading.strategyParams")}: {dash.params.setups.map((x) => t(`trading.setup_${x}`)).join(" + ")} · score ≥ {dash.params.min_score} · squeeze ≤ {Math.round(dash.params.squeeze_pct * 100)}% · stop {dash.params.min_stop_atr4h}–{dash.params.max_stop_atr4h}×ATR4h · BE @{dash.params.breakeven_at_r}R · trail @{dash.params.trail_after_r ?? "—"}R {dash.params.trail_mult_atr4h}×ATR · TP ext {dash.params.extension_enabled ? "on" : "off"}
            </TradingText>
          </>
        ) : dashLoading ? (
          <SkeletonCard lines={2} />
        ) : null}
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
        {paramsLoading && !paramSets ? <SkeletonCard lines={2} /> : null}
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

      </CollapsibleSection>

      <CollapsibleSection id="trading.control.learning" title={t("trading.learning")} defaultOpen={false}>
      <Card>
        <TradingText muted size={tokens.textXs}>
          {t("trading.learningNote")}
        </TradingText>
        {learningLoading && !learning ? <SkeletonCard lines={3} /> : null}
        {learning?.playbook ? (
          <View style={{ marginTop: 8 }}>
            <View style={{ ...row, gap: 6 }}>
              <Badge label={t("trading.playbookVersion", { v: learning.playbook.version })} tone="good" />
              <View style={{ flex: 1 }} />
              <Btn small variant="ghost" label={t("trading.disablePlaybook")} onPress={() => void control({ action: "set_playbook", version: learning.playbook!.version, status: "DISABLED" })} />
            </View>
            {learning.playbook.rules.map((r, k) => (
              <View key={k} style={{ marginTop: 8 }}>
                <TradingText bold size={tokens.textSm}>
                  {k + 1}. {r.rule}
                </TradingText>
                <TradingText muted size={tokens.textXs}>
                  {r.category} · {r.applies_when} · {t("trading.evidence", { n: r.evidence })}
                </TradingText>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ marginTop: 8 }}>
            <TradingText muted>{t("trading.noPlaybook")}</TradingText>
            {(learning?.history ?? []).slice(0, 1).map((pb) => (
              <View key={pb.version} style={{ marginTop: 6, alignSelf: "flex-start" }}>
                <Btn small variant="ghost" label={`${t("trading.activatePlaybook")} v${pb.version}`} onPress={() => void control({ action: "set_playbook", version: pb.version, status: "ACTIVE" })} />
              </View>
            ))}
          </View>
        )}
        <View style={{ marginTop: 12 }}>
          <TradingText bold size={tokens.textXs}>
            {t("trading.recentLessons")}
          </TradingText>
          {!learning?.lessons.length ? <TradingText muted size={tokens.textXs}>{t("trading.noLessons")}</TradingText> : null}
          {(learning?.lessons ?? []).slice(0, 8).map((l) => (
            <View key={l.id} style={{ marginTop: 6 }}>
              <TradingText size={tokens.textXs}>
                {l.symbol} · {fmtR(l.realized_r)} · {t(`trading.quality_${l.decision_quality}`)} — {l.lesson}
              </TradingText>
            </View>
          ))}
        </View>
      </Card>

      </CollapsibleSection>

      <CollapsibleSection id="trading.control.universe" title={t("trading.universe")} defaultOpen={false} summary={uni ? String(uni.universe.length) : null}>
      {uniLoading && !uni ? <SkeletonCard lines={3} /> : null}
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

      </CollapsibleSection>

      <CollapsibleSection id="trading.control.calendar" title={t("trading.calendar")} defaultOpen={false}>
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
      </CollapsibleSection>
    </Screen>
  );
}
