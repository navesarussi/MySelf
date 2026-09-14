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

const SNAPSHOT_KEYS = ["close", "ema20", "ema50", "rsi", "prev_rsi", "atr_pct", "relative_volume", "swing_low", "swing_high", "trend_close", "trend_ema200", "trend_adx", "room_to_resistance_r", "market_regime_ok", "funding_rate", "vix", "btc_dominance_pct"];

function fmtSnapshot(v: unknown) {
  if (typeof v === "number") return Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4);
  if (typeof v === "boolean") return v ? "✓" : "✗";
  return v === null || v === undefined ? "—" : String(v);
}

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
    const markers: ChartMarker[] = [{ t: Date.parse(tr.trigger_timestamp), label: "T", tone: "accent" }];
    for (const e of tr.events ?? []) {
      if (e.type === "PARTIAL_1R") markers.push({ t: e.at, label: "1R", tone: "good" });
      if (e.type === "CLOSED") markers.push({ t: e.at, label: "X", tone: e.price >= (tr.entry_price ?? 0) ? "good" : "warn" });
    }
    return { levels, markers };
  }, [data, t]);

  if (!data) return <Screen>{loading ? <Loading /> : null}</Screen>;
  const { trade, trigger, sibling } = data;
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
        {trigger?.agent_decision ? (
          <>
            <View style={{ ...row, gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <Badge label={trigger.agent_decision === "ENTER" ? t("trading.decisionEnter") : t("trading.decisionSkip")} tone={trigger.agent_decision === "ENTER" ? "good" : "default"} />
              {trigger.agent_conviction ? <Badge label={t("trading.conviction", { n: trigger.agent_conviction })} tone="accent" /> : null}
              {trigger.agent_confidence ? <Badge label={trigger.agent_confidence} /> : null}
              <Badge label={trade.agent_model_version} />
            </View>
            <TradingText>{trigger.agent_reasoning}</TradingText>
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
            {e.type === "STOP_MOVED" && e.from !== e.to ? ` ${fmtPrice(e.from)} → ${fmtPrice(e.to)}` : ""}
            {e.type === "CLOSED" || e.type === "CANCELLED" ? ` (${e.reason})` : ""}
            {e.note ? ` — ${e.note}` : ""}
          </TradingText>
        ))}
      </Card>

      <SectionTitle>{t("trading.snapshot")}</SectionTitle>
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {SNAPSHOT_KEYS.filter((k) => k in (trade.trigger_snapshot ?? {}) || (trigger?.snapshot && k in trigger.snapshot)).map((k) => (
            <View key={k} style={{ width: "50%", paddingVertical: 3 }}>
              <Text style={{ color: c.muted, fontSize: 10 }}>{k}</Text>
              <Text style={{ color: c.ink, fontSize: tokens.textSm, fontWeight: "600" }}>{fmtSnapshot((trigger?.snapshot ?? trade.trigger_snapshot)[k])}</Text>
            </View>
          ))}
        </View>
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
