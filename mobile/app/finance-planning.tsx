import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../src/api/resources";
import { useApiQuery, queryKeys } from "../src/query";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import type { FinanceForecast } from "@/lib/finance/forecast";
import { fmtAmount0, safeAmount } from "@/lib/finance/format";
import { Card, Loading, Screen } from "../src/components/ui";

const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function FinancePlanningScreen() {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [month] = useState(monthKey());

  const { data, loading } = useApiQuery(queryKeys.financeForecast(month), (cfg) =>
    api.financeForecast(cfg, month, 6)
  );
  const forecast = data as FinanceForecast | undefined;

  const maxNet = useMemo(
    () => Math.max(...(forecast?.rows.map((r) => Math.abs(r.cumulative_savings)) ?? [1]), 1),
    [forecast]
  );

  return (
    <Screen title={t("finance.hubPlanning")} subtitle={t("finance.planningSubtitle")}>
      {loading && !forecast ? <Loading /> : null}
      {forecast ? (
        <>
          <Card>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
              {t("finance.forecastMonthlyNet")}
            </Text>
            <Text
              style={{
                color: forecast.monthly_net >= 0 ? c.good : c.warn,
                fontWeight: "800",
                fontSize: 28,
                marginTop: 4,
                textAlign: textStart,
                writingDirection,
              }}
            >
              {forecast.monthly_net >= 0 ? "+" : "−"}₪{Math.abs(forecast.monthly_net).toLocaleString("he-IL")}
            </Text>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 8, textAlign: textStart, writingDirection }}>
              {t("finance.forecastSavingsTarget", { amount: fmtAmount0(forecast.monthly_savings) })}
            </Text>
            <Text style={{ color: c.accent, fontSize: tokens.textXs, marginTop: 4, textAlign: textStart, writingDirection }}>
              {t("finance.forecastCumulative", {
                amount: fmtAmount0(forecast.projected_cumulative),
                months: String(forecast.months_ahead),
              })}
            </Text>
          </Card>

          <Text
            style={{
              color: c.muted,
              fontSize: tokens.textXs,
              marginTop: 16,
              marginBottom: 8,
              textAlign: textStart,
              writingDirection,
            }}
          >
            {t("finance.forecastChartTitle")}
          </Text>
          {forecast.rows.map((row) => {
            const w = Math.max(8, (Math.abs(row.cumulative_savings) / maxNet) * 100);
            const positive = row.cumulative_savings >= 0;
            return (
              <View key={row.month} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ color: c.ink, fontSize: tokens.textXs, fontWeight: "600" }}>{row.label}</Text>
                  <Text style={{ color: positive ? c.good : c.warn, fontSize: tokens.textXs, fontWeight: "700" }}>
                    ₪{fmtAmount0(row.cumulative_savings)}
                  </Text>
                </View>
                <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4, overflow: "hidden" }}>
                  <View
                    style={{
                      height: 8,
                      width: `${w}%`,
                      backgroundColor: positive ? c.good : c.warn,
                      borderRadius: 4,
                    }}
                  />
                </View>
                <Text style={{ color: c.muted, fontSize: 11, marginTop: 2, textAlign: textStart, writingDirection }}>
                  {t("finance.forecastRowHint", {
                    income: fmtAmount0(row.income),
                    expense: fmtAmount0(safeAmount(row.fixed) + safeAmount(row.variable) + safeAmount(row.savings)),
                  })}
                </Text>
              </View>
            );
          })}
        </>
      ) : null}
    </Screen>
  );
}
