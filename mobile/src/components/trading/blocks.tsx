import React from "react";
import { Pressable, Text, View, type StyleProp, type TextStyle } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { GateCheck, LivePosition, PhaseGateView, TradeListItem, TriggerRow } from "@/lib/trading/types-client";
import { fmtDateTime, fmtPct, fmtPrice, fmtR, rTone } from "@/lib/trading/format";
import { positionPriceView } from "@/lib/trading/position-display";
import { useI18n } from "../../i18n";
import { useLivePrice } from "./use-live-price";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Badge, Btn, Card } from "../ui";
import { HubLinks } from "../ui/hub-links";

/** `style` is an escape hatch for numeric content that must stay LTR inside the
 *  RTL layout (prices, ratios) — it overrides the direction defaults below. */
export function TradingText({ children, muted, bold, size, color, style }: { children: React.ReactNode; muted?: boolean; bold?: boolean; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  return (
    <Text style={[{ color: color ?? (muted ? c.muted : c.ink), fontWeight: bold ? "700" : "400", fontSize: size ?? tokens.textSm, textAlign: textStart, writingDirection, lineHeight: (size ?? tokens.textSm) * 1.45 }, style]}>
      {children}
    </Text>
  );
}

const HUB = [
  { href: "/trading-journal", key: "trading.hubJournal", icon: "book-outline" as const },
  { href: "/trading-analytics", key: "trading.hubAnalytics", icon: "analytics-outline" as const },
  { href: "/trading-backtests", key: "trading.hubBacktests", icon: "flask-outline" as const },
  { href: "/trading-chat", key: "trading.hubChat", icon: "chatbubbles-outline" as const },
  { href: "/trading-control", key: "trading.hubControl", icon: "shield-checkmark-outline" as const },
];

export function TradingHubLinks() {
  const { t } = useI18n();
  return <HubLinks links={HUB.map((h) => ({ href: h.href, label: t(h.key), icon: h.icon }))} />;
}

export function GateChecklist({ checks, onReview }: { checks: GateCheck[]; onReview?: (id: string) => void }) {
  const c = useColors();
  const { t } = useI18n();
  const { row, textStart } = useLayoutDir();
  return (
    <View style={{ gap: 8 }}>
      {checks.map((ch) => (
        <View key={ch.id} style={{ ...row, gap: 8, alignItems: "flex-start" }}>
          <Ionicons name={ch.ok ? "checkmark-circle" : "close-circle"} size={18} color={ch.ok ? c.good : c.warn} />
          <View style={{ flex: 1 }}>
            <TradingText>{t(`trading.gate_${ch.id}`)}</TradingText>
            {/* Server detail is numeric/English — render LTR so "37 / 100" is not bidi-flipped. */}
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection: "ltr" }}>{ch.detail}</Text>
          </View>
          {ch.manual && !ch.ok && onReview ? <Btn small variant="ghost" label={t("trading.markReviewed")} onPress={() => onReview(ch.id)} /> : null}
        </View>
      ))}
    </View>
  );
}

export function PhaseGateCard({ gate, onAdvance, onReview }: { gate: PhaseGateView; onAdvance: () => void; onReview: (id: string) => void }) {
  const { t } = useI18n();
  const c = useColors();
  const { row, rtl } = useLayoutDir();
  const phases = ["BACKTEST", "SHADOW", "PAPER", "LIVE"] as const;
  const idx = phases.indexOf(gate.phase);
  // Stepper follows reading direction explicitly (first phase at the right in Hebrew) on every platform.
  const ordered = phases.map((p, i) => ({ p, i }));
  if (rtl) ordered.reverse();
  return (
    <Card>
      <View style={{ flexDirection: "row", direction: "ltr", gap: 4, marginBottom: 10 }}>
        {ordered.map(({ p, i }) => (
          <View key={p} style={{ flex: 1 }}>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: i < idx ? c.good : i === idx ? c.accent : c.border }} />
            <Text style={{ color: i === idx ? c.ink : c.muted, fontSize: 10, marginTop: 4, textAlign: "center", fontWeight: i === idx ? "700" : "400" }}>{t(`trading.phase_${p}`)}</Text>
          </View>
        ))}
      </View>
      <TradingText bold>{gate.next ? t("trading.gateTitle", { next: t(`trading.phase_${gate.next}`) }) : t("trading.gateFinal")}</TradingText>
      <TradingText muted size={tokens.textXs}>
        {t("trading.daysInPhase", { days: gate.days_in_phase })}
      </TradingText>
      <View style={{ marginTop: 8 }}>
        <GateChecklist checks={gate.checks} onReview={onReview} />
      </View>
      {gate.next ? (
        <View style={{ marginTop: 10, ...row, gap: 8 }}>
          <Badge label={gate.passes ? t("trading.gatePassed") : t("trading.gateNotPassed")} tone={gate.passes ? "good" : "warn"} />
          <View style={{ flex: 1 }} />
          <Btn small label={t("trading.advancePhase", { next: t(`trading.phase_${gate.next}`) })} onPress={onAdvance} disabled={!gate.passes} />
        </View>
      ) : null}
    </Card>
  );
}

export function PositionCard({ p, onClose }: { p: LivePosition; onClose: () => void }) {
  const { t } = useI18n();
  const c = useColors();
  const { row } = useLayoutDir();
  const router = useRouter();
  const live = useLivePrice(p.symbol, p.asset_class, true);
  const view = positionPriceView(p, live.price);
  const tone = rTone(view.currentR);
  const span = p.target_price - p.stop_price;
  const entryPos = p.entry_price !== null && span > 0 ? (p.entry_price - p.stop_price) / span : 1 / 3;
  const priceWaiting = view.lastPrice === null && live.source === null;
  const lastColor = live.direction === "up" ? c.good : live.direction === "down" ? c.warn : priceWaiting ? c.muted : c.ink;
  return (
    <Pressable
      onPress={() => router.push(`/trading-trade?id=${p.id}` as `/${string}`)}
      accessibilityRole="button"
      style={({ pressed }) => ({ opacity: pressed ? tokens.press : 1 })}
    >
      <Card>
        <View style={{ ...row, gap: 8 }}>
          <Text style={{ color: c.ink, fontWeight: "800", fontSize: 16, writingDirection: "ltr" }}>{p.symbol}</Text>
          <Badge label={t(`trading.state_${p.state}`)} tone={p.state === "RISK_FREE" ? "good" : p.state === "PENDING" ? "default" : "accent"} />
          {p.agent_risk_multiplier !== null && p.agent_risk_multiplier < 1 ? <Badge label={t("trading.multiplier", { m: p.agent_risk_multiplier })} /> : null}
          {p.broker ? <Badge label={t("trading.brokerBadge")} tone="good" /> : null}
          {!p.baseline_enter ? <Badge label={t("trading.aiOnly")} tone="accent" /> : null}
          <View style={{ flex: 1 }} />
          <Text style={{ color: tone === "good" ? c.good : tone === "warn" ? c.warn : c.ink, fontWeight: "800", fontSize: 18, writingDirection: "ltr" }}>{fmtR(view.currentR)}</Text>
        </View>
        <View style={{ height: 8, marginVertical: 10, borderRadius: 4, backgroundColor: c.border, direction: "ltr" }}>
          <View style={{ position: "absolute", left: `${entryPos * 100}%`, top: -2, width: 2, height: 12, backgroundColor: c.muted }} />
          {view.progress !== null ? <View style={{ position: "absolute", left: `${view.progress * 100}%`, top: -3, width: 14, height: 14, marginLeft: -7, borderRadius: 7, backgroundColor: tone === "warn" ? c.warn : c.good }} /> : null}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", direction: "ltr" }}>
          <Text style={{ color: c.warn, fontSize: tokens.textXs }}>
            {t("trading.stop")} {fmtPrice(p.stop_price)} ({fmtPct(view.distanceToStopPct)})
          </Text>
          <Text style={{ color: lastColor, fontSize: tokens.textXs, fontWeight: view.lastPrice !== null ? "600" : "400", writingDirection: "ltr" }}>
            {t("trading.last")} {priceWaiting ? t("trading.liveWaiting") : fmtPrice(view.lastPrice)}
            {live.direction === "up" ? " ▲" : live.direction === "down" ? " ▼" : ""}
          </Text>
          <Text style={{ color: c.good, fontSize: tokens.textXs }}>
            {p.exit_plan === "TRAIL_2ATR" ? t("trading.trail") : `${t("trading.target")} ${fmtPrice(p.target_price)}`}
          </Text>
        </View>
        <View style={{ ...row, marginTop: 8, gap: 8 }}>
          <TradingText muted size={tokens.textXs}>
            {p.asset_class} · {p.mode} · {t("trading.entry")} {fmtPrice(p.entry_price ?? p.entry_limit)} · {fmtDateTime(p.opened_at ?? p.trigger_timestamp)}
          </TradingText>
          <View style={{ flex: 1 }} />
          <Btn small variant="warn" label={t("trading.close")} onPress={onClose} />
        </View>
      </Card>
    </Pressable>
  );
}

export function TriggerCard({ tr }: { tr: TriggerRow }) {
  const { t } = useI18n();
  const c = useColors();
  const { row } = useLayoutDir();
  const status =
    tr.deterministic_decision === "VETO"
      ? { label: `${t("trading.vetoed")}: ${tr.vetoes.join(", ")}`, tone: "warn" as const }
      : tr.agent_decision === "SKIP"
        ? { label: t("trading.decisionSkip"), tone: "default" as const }
        : tr.deterministic_decision === "BLOCKED"
          ? { label: `${t("trading.blocked")}: ${tr.envelope_blocks.join(", ")}`, tone: "warn" as const }
          : { label: t("trading.decisionEnter"), tone: "good" as const };
  return (
    <Card>
      <View style={{ ...row, gap: 8, flexWrap: "wrap" }}>
        <Text style={{ color: c.ink, fontWeight: "700", writingDirection: "ltr" }}>{tr.symbol}</Text>
        <Badge label={status.label} tone={status.tone} />
        {tr.setup ? <Badge label={t(`trading.setup_${tr.setup}`)} /> : null}
        {tr.score !== null ? <Badge label={t("trading.scoreLabel", { n: tr.score })} tone="accent" /> : null}
        {!tr.baseline_enter ? <Badge label={t("trading.aiOnly")} /> : null}
        {tr.agent_conviction ? <Badge label={t("trading.conviction", { n: tr.agent_conviction })} tone="accent" /> : null}
        {tr.agent_rating ? <Badge label={t("trading.agentRating", { n: tr.agent_rating })} tone="accent" /> : null}
        {tr.agent_risk_multiplier !== null && tr.agent_risk_multiplier > 0 && tr.agent_risk_multiplier < 1 ? <Badge label={t("trading.multiplier", { m: tr.agent_risk_multiplier })} /> : null}
        {tr.injection_flags.length ? <Badge label={t("trading.injectionFlag")} tone="warn" /> : null}
        <View style={{ flex: 1 }} />
        <Text style={{ color: c.muted, fontSize: tokens.textXs, writingDirection: "ltr" }}>{fmtDateTime(tr.bar_time)}</Text>
      </View>
      {tr.agent_thesis || tr.agent_reasoning ? (
        <View style={{ marginTop: 6 }}>
          <TradingText muted>{tr.agent_thesis ?? tr.agent_reasoning}</TradingText>
        </View>
      ) : null}
      {tr.agent_error ? (
        <TradingText size={tokens.textXs} color={c.warn}>
          {t("trading.agentError", { msg: tr.agent_error })}
        </TradingText>
      ) : null}
    </Card>
  );
}

export function TradeRowCard({ trade }: { trade: TradeListItem }) {
  const { t } = useI18n();
  const c = useColors();
  const { row } = useLayoutDir();
  const router = useRouter();
  const r = trade.realized_r;
  const tone = rTone(r);
  return (
    <Pressable
      onPress={() => router.push(`/trading-trade?id=${trade.id}` as `/${string}`)}
      accessibilityRole="button"
      style={({ pressed }) => ({ opacity: pressed ? tokens.press : 1 })}
    >
      <Card>
        <View style={{ ...row, gap: 8 }}>
          <Text style={{ color: c.ink, fontWeight: "800", fontSize: 15, writingDirection: "ltr" }}>{trade.symbol}</Text>
          <Badge label={t(`trading.state_${trade.state}`)} tone={trade.state === "CLOSED" ? "default" : "accent"} />
          <Badge label={trade.execution} tone={trade.execution === "PAPER" ? "accent" : "default"} />
          {trade.score !== null ? <Badge label={t("trading.scoreLabel", { n: trade.score })} /> : null}
          {trade.agent_rating ? <Badge label={t("trading.agentRating", { n: trade.agent_rating })} tone="accent" /> : null}
          {trade.broker ? <Badge label={t("trading.brokerBadge")} tone="good" /> : null}
          {!trade.baseline_enter ? <Badge label={t("trading.aiOnly")} tone="accent" /> : null}
          {trade.track === "DETERMINISTIC" ? <Badge label={t("trading.trackBase")} /> : null}
          <View style={{ flex: 1 }} />
          <Text style={{ color: tone === "good" ? c.good : tone === "warn" ? c.warn : c.ink, fontWeight: "800", fontSize: 16, writingDirection: "ltr" }}>{trade.state === "CLOSED" ? fmtR(r) : "—"}</Text>
        </View>
        <View style={{ marginTop: 4 }}>
          <TradingText muted size={tokens.textXs}>
            {trade.setup ? `${t(`trading.setup_${trade.setup}`)} · ` : ""}
            {fmtDateTime(trade.trigger_timestamp)} · {t("trading.entry")} {fmtPrice(trade.entry_price ?? trade.entry_limit)}
            {trade.exit_price ? ` · ${t("trading.exit")} ${fmtPrice(trade.exit_price)}` : ""}
            {trade.exit_reason ? ` · ${trade.exit_reason}` : ""}
            {trade.tags?.length ? ` · #${trade.tags.join(" #")}` : ""}
          </TradingText>
        </View>
      </Card>
    </Pressable>
  );
}
