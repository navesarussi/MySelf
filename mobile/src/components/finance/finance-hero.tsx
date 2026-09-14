import React from "react";
import { Text, View } from "react-native";
import { localeTag } from "@/lib/i18n/core";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { HeroMetric } from "../ui/hero-metric";
import type { MonthPlanView } from "@/lib/finance/plan";

function ils(n: number, locale: "he" | "en"): string {
  return `₪${Math.round(n).toLocaleString(localeTag(locale))}`;
}

export function FinanceHero({ view }: { view: MonthPlanView }) {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const net = view.totals.net_actual;
  const netColor = net < 0 ? "warn" : net > 0 ? "good" : "default";
  const netSign = net > 0 ? "+" : net < 0 ? "−" : "";

  return (
    <HeroMetric align="center" label={t("finance.net")} value={`${netSign}${ils(Math.abs(net), locale)}`} tone={netColor}>
      <View style={{ ...row, marginTop: 14, gap: 10 }}>
        <Metric label={t("finance.income")} value={ils(view.totals.actual_income, locale)} sub={ils(view.totals.planned_income, locale)} color={c.good} />
        <View style={{ width: 1, alignSelf: "stretch", backgroundColor: c.border }} />
        <Metric label={t("finance.expense")} value={ils(view.totals.actual_expense, locale)} sub={ils(view.totals.planned_expense, locale)} color={c.ink} />
      </View>
      {view.totals.savings_planned > 0 ? (
        <Text style={{ color: c.accent, marginTop: 12, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
          {t("finance.savingsTarget")}: {ils(view.totals.savings_planned, locale)}
        </Text>
      ) : null}
    </HeroMetric>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const c = useColors();
  const { writingDirection } = useLayoutDir();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "center", writingDirection }}>{label}</Text>
      <Text style={{ color, fontWeight: "800", fontSize: tokens.title, textAlign: "center", fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "center", writingDirection }}>{sub}</Text>
    </View>
  );
}
