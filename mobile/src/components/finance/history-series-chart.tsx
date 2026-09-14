import React, { useMemo } from "react";
import { Text, View } from "react-native";
import type { HistoryTrends } from "@/lib/finance/history-trends";
import { fmtAmount0 } from "@/lib/finance/format";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";

function formatMonthShort(month: string, locale: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
    month: "short",
    year: "2-digit",
  });
}

export function HistorySeriesChart({ trends, locale }: { trends: HistoryTrends; locale: string }) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row, progressAlign } = useLayoutDir();
  const maxVal = useMemo(
    () => Math.max(...trends.series.flatMap((s) => [s.income, s.expense, Math.abs(s.net)]), 1),
    [trends.series]
  );

  return (
    <View style={{ marginTop: 8, gap: 10 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
        {t("finance.historyChartTitle")}
      </Text>
      {trends.series.map((point) => {
        const netW = Math.max(6, (Math.abs(point.net) / maxVal) * 100);
        const expW = Math.max(4, (point.expense / maxVal) * 100);
        const incW = Math.max(4, (point.income / maxVal) * 100);
        const netWidth = `${netW}%` as `${number}%`;
        return (
          <View key={point.month}>
            <View style={{ ...row, justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ color: c.ink, fontSize: tokens.textXs, fontWeight: "600" }}>
                {formatMonthShort(point.month, locale)}
              </Text>
              <Text style={{ color: point.net >= 0 ? c.good : c.warn, fontSize: tokens.textXs, fontWeight: "700" }}>
                {point.net >= 0 ? "+" : "−"}₪{fmtAmount0(Math.abs(point.net))}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 4, height: 6, marginBottom: 2, direction: "ltr" }}>
              <View style={{ flex: incW, backgroundColor: c.good, borderRadius: 3, opacity: 0.85 }} />
              <View style={{ flex: expW, backgroundColor: c.warn, borderRadius: 3, opacity: 0.75 }} />
            </View>
            <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4, overflow: "hidden" }}>
              <View
                style={{
                  height: 8,
                  width: netWidth,
                  backgroundColor: point.net >= 0 ? c.good : c.warn,
                  borderRadius: 4,
                  alignSelf: progressAlign,
                }}
              />
            </View>
          </View>
        );
      })}
      <View style={{ ...row, gap: 12, marginTop: 4 }}>
        <Text style={{ color: c.good, fontSize: 11 }}>■ {t("finance.income")}</Text>
        <Text style={{ color: c.warn, fontSize: 11 }}>■ {t("finance.expense")}</Text>
        <Text style={{ color: c.accent, fontSize: 11 }}>■ {t("finance.net")}</Text>
      </View>
    </View>
  );
}
