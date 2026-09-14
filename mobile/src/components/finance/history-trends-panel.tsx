import React from "react";
import { Text, View } from "react-native";
import type { FinanceHistory } from "@/lib/finance/history";
import type { HistoryTrendMetric } from "@/lib/finance/history-trends";
import { fmtAmount0 } from "@/lib/finance/format";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card, SectionTitle } from "../ui";
import { HistorySeriesChart } from "./history-series-chart";

function TrendBadge({ label, metric, invert }: { label: string; metric: HistoryTrendMetric; invert?: boolean }) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const goodWhenDown = invert ?? false;
  const color =
    metric.direction === "flat"
      ? c.muted
      : metric.direction === "up"
        ? goodWhenDown ? c.warn : c.good
        : goodWhenDown ? c.good : c.warn;
  const arrow = metric.direction === "up" ? "↑" : metric.direction === "down" ? "↓" : "→";
  const key =
    metric.direction === "flat"
      ? "finance.historyTrendFlat"
      : metric.direction === "up"
        ? "finance.historyTrendUp"
        : "finance.historyTrendDown";

  return (
    <View style={{ flex: 1, minWidth: 96 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>{label}</Text>
      <View style={{ ...row, gap: 4, marginTop: 2, alignItems: "center" }}>
        <Text style={{ color, fontWeight: "700", fontSize: tokens.textSm }}>{arrow}</Text>
        <Text style={{ color, fontWeight: "600", fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
          {metric.direction === "flat"
            ? t(key)
            : t(key, { pct: String(Math.abs(Math.round(metric.change_pct))) })}
        </Text>
      </View>
    </View>
  );
}

export function HistoryTrendsPanel({ history, locale }: { history: FinanceHistory; locale: string }) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const trends = history.trends;

  return (
    <>
      <SectionTitle>{t("finance.historyTrendsTitle")}</SectionTitle>
      <Card>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
          {t("finance.historyPeriodTotals", { count: String(history.months) })}
        </Text>
        <Text
          style={{
            color: trends.total_net >= 0 ? c.good : c.warn,
            fontWeight: "800",
            fontSize: 28,
            marginTop: 4,
            textAlign: textStart,
            writingDirection,
          }}
        >
          {trends.total_net >= 0 ? "+" : "−"}₪{fmtAmount0(Math.abs(trends.total_net))}
        </Text>
        <View style={{ ...row, justifyContent: "space-between", marginTop: 8, gap: 8 }}>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {t("finance.historyTotalIncome")}: ₪{fmtAmount0(trends.total_income)}
          </Text>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {t("finance.historyTotalExpense")}: ₪{fmtAmount0(trends.total_expense)}
          </Text>
        </View>
        <View style={{ ...row, marginTop: 12, gap: 8, flexWrap: "wrap" }}>
          <TrendBadge label={t("finance.income")} metric={trends.income_trend} />
          <TrendBadge label={t("finance.expense")} metric={trends.expense_trend} invert />
          <TrendBadge label={t("finance.net")} metric={trends.net_trend} />
        </View>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 10, textAlign: textStart, writingDirection }}>
          {t("finance.historyAvgPerMonth", {
            income: fmtAmount0(trends.avg_income),
            expense: fmtAmount0(trends.avg_expense),
            net: fmtAmount0(trends.avg_net),
          })}
        </Text>
        <HistorySeriesChart trends={trends} locale={locale} />
      </Card>

      {trends.top_categories.length > 0 ? (
        <>
          <SectionTitle>{t("finance.historyTopCategories")}</SectionTitle>
          <Card>
            {trends.top_categories.map((cat) => (
              <View
                key={cat.category}
                style={{ ...row, justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}
              >
                <Text style={{ color: c.ink, fontSize: tokens.textSm, flex: 1, textAlign: textStart, writingDirection }}>
                  {cat.category}
                </Text>
                <Text style={{ color: c.muted, fontSize: tokens.textXs }}>
                  {cat.share_pct}% · ₪{fmtAmount0(cat.amount)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {trends.plan_summary.months_with_plan > 0 ? (
        <>
          <SectionTitle>{t("finance.historyPlanAdherence")}</SectionTitle>
          <Card>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
              {t("finance.historyPlanMonths", { count: String(trends.plan_summary.months_with_plan) })}
            </Text>
            <Text style={{ color: c.ink, fontSize: tokens.textSm, marginTop: 6, textAlign: textStart, writingDirection }}>
              {t("finance.historyPlanTotals", {
                planned: fmtAmount0(trends.plan_summary.total_planned_net),
                actual: fmtAmount0(trends.plan_summary.total_actual_net),
              })}
            </Text>
            <Text
              style={{
                color: trends.plan_summary.variance >= 0 ? c.good : c.warn,
                fontWeight: "700",
                fontSize: tokens.text,
                marginTop: 4,
                textAlign: textStart,
                writingDirection,
              }}
            >
              {t("finance.historyPlanVariance", {
                amount: fmtAmount0(Math.abs(trends.plan_summary.variance)),
                sign: trends.plan_summary.variance >= 0 ? "+" : "−",
              })}
            </Text>
          </Card>
        </>
      ) : null}
    </>
  );
}
