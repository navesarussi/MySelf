import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../src/api/resources";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { queryClient, queryKeys, useApiMutation, useApiQuery } from "../src/query";
import { Badge, Btn, Card, Input, Loading, Screen, SectionTitle } from "../src/components/ui";
import { CandleChart, KpiGrid, type ChartLevel, type ChartMarker } from "../src/components/trading/charts";
import { TradingText } from "../src/components/trading/blocks";
import { fmtDateTime, fmtPrice, fmtR, fmtSignedUsd, fmtUsd, rTone } from "@/lib/trading/format";

type TfRead = { trend: string; structure: string; rsi: number | null; adx: number | null; volume_ratio: number | null; squeeze_pct: number | null; bearish_divergence: boolean };
type TriggerSnapshot = {
  candidate?: { setup: string; score: number; reasons: string[]; target_menu: { price: number; rr: number; kind: string }[] };
  brief?: { daily: TfRead; h4: TfRead; h1: TfRead; nearest_resistance: { price: number; touches: number } | null; nearest_support: { price: number; touches: number } | null };
  funding_rate?: number | null;
  vix?: number | null;
};

const fmtNum = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : v.toFixed(d));

export default function TradingTradeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const c = useColors();
  const { row } = useLayoutDir();
  const router = useRouter();
  const { run } = useApiMutation();
  const { data, loading, refresh } = useApiQuery(queryKeys.tradingTrade(String(id)), (cfg) => api.tradingTrade(cfg, String(id)), { enabled: Boolean(id) });
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [rating, setRating] = useState<number | null>(null);

  useEffect(() => {
    if (!data) return;
    setNotes(data.trade.notes ?? "");
    setTags((data.trade.tags ?? []).join(", "));
    setRating(data.trade.self_rating);
  }, [data]);

  const chart = useMemo(() => {
    if (!data) return null;
    const tr = data.trade;
    const levels: ChartLevel[] = [
      { price: tr.entry_price ?? tr.entry_limit, label: t("trading.entry"), tone: "accent" },
      { price: tr.initial_stop_price, label: t("trading.stop"), tone: "warn" },
      { price: tr.target_price, label: t("trading.target"), tone: "good" },
    ];
    if (tr.exit_price) levels.push({ price: tr.exit_price, label: t("trading.exit"), tone: "muted" });
    const initialTarget = tr.sim_state?.initial_target_price;
    if (initialTarget && Math.abs(initialTarget - tr.target_price) > 1e-9) levels.push({ price: initialTarget, label: "TP₀", tone: "muted" });
    const markers: ChartMarker[] = [{ t: Date.parse(tr.trigger_timestamp), label: "T", tone: "accent" }];
    for (const e of tr.events ?? []) {
      if (e.type === "PARTIAL_1R") markers.push({ t: e.at, label: "1R", tone: "good" });
      if (e.type === "TARGET_EXTENDED") markers.push({ t: e.at, label: "↑TP", tone: "accent" });
      if (e.type === "CLOSED") markers.push({ t: e.at, label: "X", tone: e.price >= (tr.entry_price ?? 0) ? "good" : "warn" });
    }
    return { levels, markers };
  }, [data, t]);

  if (!data) return <Screen>{loading ? <Loading /> : null}</Screen>;
  const { trade, trigger, sibling, lesson } = data;
  const snap = (trigger?.snapshot ?? trade.trigger_snapshot ?? {}) as TriggerSnapshot;
  const menu = snap.candidate?.target_menu ?? [];
  const chosen = trigger?.agent_target_index ?? null;
  const tone = rTone(trade.realized_r);
  const save = () =>
    run(
      (cfg) =>
        api.patchTradingTrade(cfg, trade.id, {
          notes: notes.trim() || null,
          tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
          self_rating: rating,
        }),
      { onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.tradingAll }) }
    );

  return (
    <Screen title={t("trading.tradeTitle", { symbol: trade.symbol })} subtitle={`${trade.asset_class} · ${trade.bucket_id} · ${trade.mode}`} onRefresh={refresh} refreshing={loading}>
      <View style={{ ...row, gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <Badge label={t(`trading.state_${trade.state}`)} tone="accent" />
        <Badge label={trade.execution} />
        <Badge label={trade.track === "AGENT" ? t("trading.trackAgent") : t("trading.trackDeterministic")} />
        {trade.exit_reason ? <Badge label={trade.exit_reason} tone={tone === "warn" ? "warn" : "good"} /> : null}
        {trade.gapped_through_stop ? <Badge label={t("trading.gapped")} tone="warn" /> : null}
      </View>

      <KpiGrid
        items={[
          { label: "R", value: trade.state === "CLOSED" ? fmtR(trade.realized_r) : "—", tone: tone === "good" ? "good" : tone === "warn" ? "warn" : "default" },
          { label: "P&L", value: fmtSignedUsd(trade.realized_pnl), hint: `1R = ${fmtUsd(trade.risk_amount)}` },
          { label: "MFE / MAE", value: `${fmtR(trade.mfe_r, 1)} / ${fmtR(trade.mae_r, 1)}` },
          { label: t("trading.entry"), value: fmtPrice(trade.entry_price ?? trade.entry_limit), hint: trade.entry_slippage_bps !== null ? `${t("trading.slippage")} ${trade.entry_slippage_bps}bps` : undefined },
          { label: t("trading.stop"), value: fmtPrice(trade.initial_stop_price), hint: trade.stop_price !== trade.initial_stop_price ? `→ ${fmtPrice(trade.stop_price)}` : undefined },
          { label: t("trading.fees"), value: fmtUsd(trade.fees_paid, 2), hint: `×${trade.agent_risk_multiplier ?? 1} · ${trade.position_size}` },
        ]}
      />

      {trade.chart_bars?.length && chart ? (
        <Card>
          <TradingText muted size={tokens.textXs}>
            {t("trading.chart")}
          </TradingText>
          <View style={{ marginTop: 6 }}>
            <CandleChart bars={trade.chart_bars} levels={chart.levels} markers={chart.markers} />
          </View>
        </Card>
      ) : null}

      <SectionTitle>{t("trading.agentReasoning")}</SectionTitle>
      <Card>
        {trade.strategy_version === "intraday" ? (
          <>
            <View style={{ ...row, gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <Badge label={trade.agent_rating ? t("trading.agentRating", { n: trade.agent_rating }) : t("trading.ratingPending")} tone={trade.agent_rating ? "accent" : "default"} />
              {trade.agent_rating ? <Badge label={trade.agent_model_version} /> : null}
            </View>
            {trade.agent_rating_explanation ? <TradingText>{trade.agent_rating_explanation}</TradingText> : null}
            {trigger?.agent_error ? (
              <TradingText size={tokens.textXs} color={c.warn}>
                {t("trading.agentError", { msg: trigger.agent_error })}
              </TradingText>
            ) : null}
          </>
        ) : trigger?.agent_decision ? (
          <>
            <View style={{ ...row, gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <Badge label={trigger.agent_decision === "ENTER" ? t("trading.decisionEnter") : t("trading.decisionSkip")} tone={trigger.agent_decision === "ENTER" ? "good" : "default"} />
              {trigger.agent_conviction ? <Badge label={t("trading.conviction", { n: trigger.agent_conviction })} tone="accent" /> : null}
              {trigger.agent_confidence ? <Badge label={trigger.agent_confidence} /> : null}
              <Badge label={trade.agent_model_version} />
            </View>
            {trigger.agent_market_read ? (
              <View style={{ marginBottom: 8 }}>
                <TradingText muted bold size={tokens.textXs}>
                  {t("trading.marketRead")}
                </TradingText>
                <TradingText>{trigger.agent_market_read}</TradingText>
              </View>
            ) : null}
            {trigger.agent_thesis ? (
              <View style={{ marginBottom: 8 }}>
                <TradingText muted bold size={tokens.textXs}>
                  {t("trading.thesis")}
                </TradingText>
                <TradingText>{trigger.agent_thesis}</TradingText>
              </View>
            ) : null}
            {trigger.agent_invalidation ? (
              <View style={{ marginBottom: 8 }}>
                <TradingText muted bold size={tokens.textXs}>
                  {t("trading.invalidation")}
                </TradingText>
                <TradingText>{trigger.agent_invalidation}</TradingText>
              </View>
            ) : null}
            <TradingText>{trigger.agent_reasoning}</TradingText>
            {chosen !== null && menu[chosen] ? (
              <TradingText muted size={tokens.textXs}>
                {t("trading.targetChosen", { i: chosen, rr: menu[chosen].rr, kind: menu[chosen].kind })}
              </TradingText>
            ) : null}
            {trigger.agent_lessons_applied?.length ? (
              <View style={{ marginTop: 8 }}>
                <TradingText muted bold size={tokens.textXs}>
                  {t("trading.lessonsApplied")}
                </TradingText>
                {trigger.agent_lessons_applied.map((l) => (
                  <TradingText key={l} muted size={tokens.textXs}>
                    • {l}
                  </TradingText>
                ))}
              </View>
            ) : null}
            {trigger.agent_key_risks?.length ? (
              <View style={{ marginTop: 8 }}>
                <TradingText muted bold size={tokens.textXs}>
                  {t("trading.keyRisks")}
                </TradingText>
                {trigger.agent_key_risks.map((k) => (
                  <TradingText key={k} muted size={tokens.textXs}>
                    • {k}
                  </TradingText>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <TradingText muted>{trigger?.agent_error ?? t("trading.noAgent")}</TradingText>
        )}
      </Card>

      {lesson ? (
        <>
          <SectionTitle>{t("trading.lesson")}</SectionTitle>
          <Card>
            <View style={{ ...row, gap: 6, marginBottom: 6 }}>
              <Badge label={t(`trading.quality_${lesson.decision_quality}`)} tone={lesson.decision_quality === "GOOD" ? "good" : lesson.decision_quality === "POOR" ? "warn" : "default"} />
              <Badge label={lesson.category} />
            </View>
            <TradingText>{lesson.what_happened}</TradingText>
            <View style={{ marginTop: 6 }}>
              <TradingText bold>{lesson.lesson}</TradingText>
            </View>
            <TradingText muted size={tokens.textXs}>
              {lesson.applies_when}
            </TradingText>
          </Card>
        </>
      ) : null}

      {sibling ? (
        <Pressable onPress={() => router.replace(`/trading-trade?id=${sibling.id}` as `/${string}`)}>
          <Card>
            <TradingText muted size={tokens.textXs}>
              {t("trading.siblingTrack")}: {sibling.track} · {sibling.execution} · {t(`trading.state_${sibling.state}`)} · {sibling.state === "CLOSED" ? fmtR(sibling.realized_r) : "…"}
            </TradingText>
          </Card>
        </Pressable>
      ) : null}

      <SectionTitle>{t("trading.lifecycle")}</SectionTitle>
      <Card>
        <TradingText muted size={tokens.textXs}>
          T · {fmtDateTime(trade.trigger_timestamp, locale)} · limit {fmtPrice(trade.entry_limit)}
        </TradingText>
        {(trade.events ?? []).map((e, i) => (
          <TradingText key={i} size={tokens.textXs}>
            {fmtDateTime(e.at, locale)} · {e.type}
            {"price" in e ? ` @ ${fmtPrice(e.price)}` : ""}
            {(e.type === "STOP_MOVED" || e.type === "TARGET_EXTENDED") && e.from !== e.to ? ` ${fmtPrice(e.from)} → ${fmtPrice(e.to)}` : ""}
            {e.type === "CLOSED" || e.type === "CANCELLED" ? ` (${e.reason})` : ""}
            {e.note ? ` — ${e.note}` : ""}
          </TradingText>
        ))}
      </Card>

      <SectionTitle>{t("trading.snapshot")}</SectionTitle>
      <Card>
        {snap.candidate ? (
          <View style={{ marginBottom: 8 }}>
            <View style={{ ...row, gap: 6, marginBottom: 4 }}>
              <Badge label={t(`trading.setup_${snap.candidate.setup}`)} tone="accent" />
              <Badge label={t("trading.scoreLabel", { n: snap.candidate.score })} />
            </View>
            <TradingText muted bold size={tokens.textXs}>
              {t("trading.scoreReasons")}
            </TradingText>
            {snap.candidate.reasons.map((r) => (
              <TradingText key={r} size={tokens.textXs}>
                {r}
              </TradingText>
            ))}
          </View>
        ) : null}
        {snap.brief ? (
          <View style={{ direction: "ltr" }}>
            {(["daily", "h4", "h1"] as const).map((k) => {
              const r = snap.brief![k];
              return (
                <View key={k} style={{ flexDirection: "row", paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: c.border }}>
                  <Text style={{ width: 44, color: c.muted, fontSize: tokens.textXs }}>{k}</Text>
                  <Text style={{ flex: 1, color: c.ink, fontSize: tokens.textXs }}>
                    {r.trend} · {r.structure} · RSI {fmtNum(r.rsi)} · ADX {fmtNum(r.adx)} · vol×{fmtNum(r.volume_ratio, 2)} · sq {r.squeeze_pct === null ? "—" : Math.round(r.squeeze_pct * 100) + "%"}
                    {r.bearish_divergence ? " · div⚠" : ""}
                  </Text>
                </View>
              );
            })}
            <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 4 }}>
              R {snap.brief.nearest_resistance ? `${fmtPrice(snap.brief.nearest_resistance.price)} (${snap.brief.nearest_resistance.touches}×)` : "—"} · S {snap.brief.nearest_support ? `${fmtPrice(snap.brief.nearest_support.price)} (${snap.brief.nearest_support.touches}×)` : "—"}
              {snap.funding_rate !== undefined && snap.funding_rate !== null ? ` · funding ${(snap.funding_rate * 100).toFixed(3)}%` : ""}
              {snap.vix ? ` · VIX ${snap.vix.toFixed(1)}` : ""}
            </Text>
          </View>
        ) : null}
        {trigger?.vetoes.length || trigger?.envelope_blocks.length ? (
          <TradingText size={tokens.textXs} color={c.warn}>
            {[...(trigger?.vetoes ?? []), ...(trigger?.envelope_blocks ?? [])].join(" · ")}
          </TradingText>
        ) : null}
      </Card>

      <SectionTitle>{t("trading.journalNotes")}</SectionTitle>
      <Card>
        <Input value={notes} onChangeText={setNotes} placeholder={t("trading.notesPlaceholder")} multiline style={{ minHeight: 90, textAlignVertical: "top" }} />
        <Input value={tags} onChangeText={setTags} placeholder={t("trading.tagsPlaceholder")} />
        <View style={{ ...row, gap: 6, marginBottom: 10 }}>
          <TradingText muted size={tokens.textXs}>
            {t("trading.selfRating")}
          </TradingText>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(rating === n ? null : n)} hitSlop={6}>
              <Text style={{ fontSize: 22, color: rating !== null && n <= rating ? c.accent2 : c.border }}>★</Text>
            </Pressable>
          ))}
        </View>
        <Btn label={t("trading.save")} onPress={() => void save()} />
      </Card>
    </Screen>
  );
}
