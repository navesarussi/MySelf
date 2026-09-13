import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api/resources";
import { useApiQuery, queryKeys } from "../src/query";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import type { FinanceHistory, HistoryMonthRow } from "@/lib/finance/history";
import { HISTORY_MONTH_OPTIONS } from "@/lib/finance/history";
import { fmtAmount0 } from "@/lib/finance/format";
import { Card, Chip, EmptyState, Loading, Row, Screen } from "../src/components/ui";

const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function formatMonthLabel(month: string, locale: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
    month: "long",
    year: "numeric",
  });
}

function MonthHistoryCard({
  row,
  locale,
  onOpen,
}: {
  row: HistoryMonthRow;
  locale: string;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row: rowDir } = useLayoutDir();
  const netColor = row.net >= 0 ? c.good : c.warn;

  return (
    <Pressable onPress={onOpen} accessibilityRole="button">
      <Card>
        <Text
          style={{
            color: c.ink,
            fontWeight: "700",
            fontSize: tokens.text,
            textAlign: textStart,
            writingDirection,
            marginBottom: 8,
          }}
        >
          {formatMonthLabel(row.month, locale)}
        </Text>
        <View style={{ ...rowDir, justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {t("finance.income")}: ₪{fmtAmount0(row.income)}
          </Text>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {t("finance.expense")}: ₪{fmtAmount0(row.expense)}
          </Text>
        </View>
        <Text
          style={{
            color: netColor,
            fontWeight: "800",
            fontSize: 22,
            textAlign: textStart,
            writingDirection,
            marginBottom: 8,
          }}
        >
          {row.net >= 0 ? "+" : "−"}₪{fmtAmount0(Math.abs(row.net))}
        </Text>
        {row.plan ? (
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {t("finance.historyPlanVsActual", {
              planned: fmtAmount0(row.plan.net_planned),
              actual: fmtAmount0(row.plan.net_actual),
            })}
          </Text>
        ) : (
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {t("finance.historyNoPlan")}
          </Text>
        )}
        {row.category_deltas.length > 0 ? (
          <View style={{ marginTop: 10, gap: 4 }}>
            <Text
              style={{
                color: c.ink,
                fontWeight: "600",
                fontSize: tokens.textXs,
                textAlign: textStart,
                writingDirection,
              }}
            >
              {t("finance.historyCategoryMovers")}
            </Text>
            {row.category_deltas.map((d) => (
              <Text
                key={d.category}
                style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}
              >
                {d.category}: {d.delta >= 0 ? "+" : "−"}₪{fmtAmount0(Math.abs(d.delta))}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

export default function FinanceHistoryScreen() {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const [months, setMonths] = useState<(typeof HISTORY_MONTH_OPTIONS)[number]>(6);
  const endMonth = useMemo(() => monthKey(), []);

  const { data, loading } = useApiQuery(queryKeys.financeHistory(months), (cfg) =>
    api.financeHistory(cfg, months, endMonth)
  );
  const history = data as FinanceHistory | undefined;
  const rowsNewestFirst = useMemo(() => [...(history?.rows ?? [])].reverse(), [history]);

  return (
    <Screen title={t("finance.hubHistory")} subtitle={t("finance.historySubtitle")}>
      <Text style={{ color: c.muted, fontSize: tokens.textSm, marginBottom: 8, textAlign: textStart, writingDirection }}>
        {t("finance.historyRangeHint")}
      </Text>
      <Row wrap>
        {HISTORY_MONTH_OPTIONS.map((n) => (
          <Chip key={n} label={t("finance.historyMonths", { count: String(n) })} active={months === n} onPress={() => setMonths(n)} />
        ))}
      </Row>
      {loading && !history ? <Loading /> : null}
      {!loading && rowsNewestFirst.length === 0 ? <EmptyState text={t("finance.historyEmpty")} /> : null}
      <View style={{ gap: 10, marginTop: 12 }}>
        {rowsNewestFirst.map((row) => (
          <MonthHistoryCard
            key={row.month}
            row={row}
            locale={locale}
            onOpen={() => router.push(`/finance?month=${row.month}` as `/${string}`)}
          />
        ))}
      </View>
    </Screen>
  );
}
