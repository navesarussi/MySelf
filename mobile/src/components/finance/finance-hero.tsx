import React from "react";
import { Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card } from "../ui";
import type { MonthPlanView } from "@/lib/finance/plan";

function ils(n: number): string {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}

export function FinanceHero({ view }: { view: MonthPlanView }) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const net = view.totals.net_actual;
  const netColor = net < 0 ? c.warn : net > 0 ? c.good : c.ink;
  const netSign = net > 0 ? "+" : net < 0 ? "−" : "";

  return (
    <Card style={{ paddingVertical: 16, marginBottom: 12 }}>
      <Text
        style={{
          color: c.muted,
          fontSize: tokens.textXs,
          fontWeight: "600",
          textAlign: "center",
          writingDirection,
        }}
      >
        {t("finance.net")}
      </Text>
      <Text
        style={{
          color: netColor,
          fontWeight: "800",
          fontSize: 32,
          lineHeight: 38,
          marginTop: 2,
          textAlign: "center",
          fontVariant: ["tabular-nums"],
        }}
      >
        {netSign}
        {ils(Math.abs(net))}
      </Text>
      <View style={{ ...row, marginTop: 14, gap: 10 }}>
        <Metric
          label={t("finance.income")}
          value={ils(view.totals.actual_income)}
          sub={ils(view.totals.planned_income)}
          color={c.good}
        />
        <View style={{ width: 1, alignSelf: "stretch", backgroundColor: c.border }} />
        <Metric
          label={t("finance.expense")}
          value={ils(view.totals.actual_expense)}
          sub={ils(view.totals.planned_expense)}
          color={c.ink}
        />
      </View>
      {view.totals.savings_planned > 0 ? (
        <Text
          style={{
            color: c.accent,
            marginTop: 12,
            fontSize: tokens.textXs,
            textAlign: textStart,
            writingDirection,
          }}
        >
          {t("finance.savingsTarget")}: {ils(view.totals.savings_planned)}
        </Text>
      ) : null}
    </Card>
  );
}

function Metric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  const c = useColors();
  const { writingDirection } = useLayoutDir();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "center", writingDirection }}>
        {label}
      </Text>
      <Text
        style={{
          color,
          fontWeight: "800",
          fontSize: tokens.title,
          textAlign: "center",
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "center", writingDirection }}>
        {sub}
      </Text>
    </View>
  );
}
