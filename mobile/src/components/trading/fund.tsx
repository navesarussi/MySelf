import React from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { FundView, HealthReport } from "@/lib/trading/types-client";
import { fmtPct } from "@/lib/trading/format";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Card } from "../ui";
import type { KpiItem } from "../ui/kpi-grid";
import { KpiGrid } from "./charts";
import { TradingText } from "./blocks";

/** The health monitor's last report (lib/trading/fund/health.ts): status plus every check that is not ok. */
export function HealthBadge({ health }: { health: HealthReport | null }) {
  const c = useColors();
  const { t } = useI18n();
  const { row } = useLayoutDir();
  const status = health?.status ?? "ok";
  const color = status === "ok" ? c.good : c.warn;
  const label = t(status === "critical" ? "trading.fund.healthCritical" : status === "warn" ? "trading.fund.healthWarn" : "trading.fund.healthOk");
  const problems = (health?.checks ?? []).filter((x) => x.level !== "ok");
  return (
    <View style={{ gap: 4 }}>
      <View style={{ ...row, gap: 6, alignItems: "center" }}>
        <Ionicons name={status === "ok" ? "checkmark-circle" : status === "warn" ? "alert-circle" : "warning"} size={18} color={color} />
        <TradingText bold color={color}>{`${t("trading.fund.health")}: ${label}`}</TradingText>
      </View>
      {problems.map((p) => (
        <TradingText key={p.id} muted size={tokens.textXs}>
          {p.message}
        </TradingText>
      ))}
    </View>
  );
}

export function fundKpis(v: FundView, t: (k: string) => string): KpiItem[] {
  const track = v.tracking.map((x) => x.stats).filter((s) => s.days > 0);
  const diff = track.length ? track.reduce((s, x) => s + x.diff_cum, 0) : null;
  return [
    { label: t("trading.fund.itd"), value: fmtPct(v.itd_return, 2), tone: v.itd_return === null ? "default" : v.itd_return >= 0 ? "good" : "warn" },
    { label: t("trading.fund.mtd"), value: fmtPct(v.mtd_return, 2), tone: v.mtd_return === null ? "default" : v.mtd_return >= 0 ? "good" : "warn" },
    { label: t("trading.fund.drawdown"), value: v.drawdown === null ? "—" : fmtPct(-v.drawdown, 1) },
    { label: t("trading.fund.vsModel"), value: fmtPct(diff, 2) },
  ];
}

/** Top of the trading tab: health and the fund's headline numbers, linking to the fund screen. */
export function FundCard({ fund }: { fund: FundView | null | undefined }) {
  const { t } = useI18n();
  const router = useRouter();
  if (!fund) return null;
  return (
    <Card>
      <HealthBadge health={fund.health} />
      <View style={{ height: 8 }} />
      {fund.nav.length ? <KpiGrid items={fundKpis(fund, t)} /> : <TradingText muted>{t("trading.fund.empty")}</TradingText>}
      <Btn small variant="ghost" label={t("trading.fund.open")} onPress={() => router.push("/trading-fund" as `/${string}`)} />
    </Card>
  );
}
