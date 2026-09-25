import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatLocaleDate } from "@/lib/i18n/core";
import type { HabitHistoryDay } from "@/lib/habit-history";
import { partitionHabitHistory } from "@/lib/habit-history";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { Btn, Row } from "./ui";

const STATUS_SYMBOL: Record<HabitHistoryDay["status"], string> = {
  success: "✓",
  fall: "✗",
  missed: "—",
  pending: "·",
  future: "",
};

function ReportedDayRow({
  day,
  index,
}: {
  day: HabitHistoryDay;
  index: number;
}) {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const color = day.status === "success" ? c.good : c.warn;
  const label = day.status === "success" ? t("habits.historySuccess") : t("habits.historyFall");

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderTopWidth: index === 0 ? 0 : 1,
        borderTopColor: c.border,
        backgroundColor: index % 2 === 0 ? c.surface : c.bg,
        gap: 8,
      }}
    >
      <Text
        style={{
          color: c.ink,
          fontSize: tokens.textXs,
          fontWeight: "600",
          textAlign: textStart,
          writingDirection,
          flexShrink: 0,
        }}
      >
        {formatLocaleDate(locale, day.date)}
      </Text>
      <Text style={{ color, fontWeight: "800", fontSize: tokens.textSm, minWidth: 18, textAlign: "center" }}>
        {STATUS_SYMBOL[day.status]}
      </Text>
      <Text
        style={{
          color: c.muted,
          fontSize: tokens.textXs,
          minWidth: 72,
          textAlign: textStart,
          writingDirection,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function HabitHistoryTable({
  days,
  onBackfill,
  rowErrors,
}: {
  days: HabitHistoryDay[];
  onBackfill?: (date: string, type: "check_in" | "fall") => void;
  rowErrors?: ReadonlyMap<string, string>;
}) {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [reportedExpanded, setReportedExpanded] = useState(false);
  const safeDays = Array.isArray(days) ? days : [];

  const { missed, reported, other } = useMemo(() => partitionHabitHistory(safeDays), [safeDays]);

  if (safeDays.length === 0) {
    return (
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
        {t("habits.historyEmpty")}
      </Text>
    );
  }

  return (
    <View style={{ marginTop: 4, gap: 12 }}>
      {missed.length > 0 ? (
        <View>
          <Text style={{ color: c.warn, fontWeight: "700", fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {t("habits.missedReportsTitle", { count: missed.length })}
          </Text>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 4, marginBottom: 8, textAlign: textStart, writingDirection }}>
            {t("habits.missedReportsHint")}
          </Text>
          <View style={{ borderWidth: 1, borderColor: c.warn, borderRadius: tokens.radiusSm, overflow: "hidden" }}>
            {missed.map((day, index) => (
              <View
                key={day.date}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: c.border,
                  backgroundColor: index % 2 === 0 ? c.surface : c.bg,
                  gap: 8,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      color: c.ink,
                      fontSize: tokens.textXs,
                      fontWeight: "600",
                      textAlign: textStart,
                      writingDirection,
                    }}
                  >
                    {formatLocaleDate(locale, day.date)}
                  </Text>
                  {rowErrors?.get(day.date) ? (
                    <Text style={{ color: c.warn, fontSize: 10, textAlign: textStart, writingDirection }}>
                      {rowErrors.get(day.date)}
                    </Text>
                  ) : null}
                </View>
                {onBackfill ? (
                  <Row style={{ gap: 6 }}>
                    <Btn
                      small
                      label={t("habits.backfillSuccess")}
                      onPress={() => onBackfill(day.date, "check_in")}
                    />
                    <Btn
                      small
                      variant="warn"
                      label={t("habits.backfillFall")}
                      onPress={() => onBackfill(day.date, "fall")}
                    />
                  </Row>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {reported.length > 0 ? (
        <View>
          <Pressable
            onPress={() => setReportedExpanded((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
          >
            <Ionicons
              name={reportedExpanded ? "chevron-down" : "chevron-back"}
              size={14}
              color={c.muted}
            />
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
              {t("habits.historyReportedSection", { count: reported.length })}
            </Text>
          </Pressable>
          {reportedExpanded ? (
            <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: tokens.radiusSm, overflow: "hidden", marginTop: 4 }}>
              {reported.map((day, index) => (
                <ReportedDayRow key={day.date} day={day} index={index} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {other.length > 0 ? (
        <View>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>
            {t("habits.historyLegend")}
          </Text>
          <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: tokens.radiusSm, overflow: "hidden" }}>
            {other.map((day, index) => {
              const color =
                day.status === "pending" ? c.muted : c.muted;
              const label =
                day.status === "pending" ? t("habits.historyPending") : "";

              return (
                <View
                  key={day.date}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: c.border,
                    backgroundColor: index % 2 === 0 ? c.surface : c.bg,
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      color: c.ink,
                      fontSize: tokens.textXs,
                      fontWeight: "600",
                      textAlign: textStart,
                      writingDirection,
                    }}
                  >
                    {formatLocaleDate(locale, day.date)}
                  </Text>
                  <Text style={{ color, fontWeight: "800", fontSize: tokens.textSm, minWidth: 18, textAlign: "center" }}>
                    {STATUS_SYMBOL[day.status]}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: tokens.textXs, minWidth: 72, textAlign: textStart, writingDirection }}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {missed.length === 0 && reported.length === 0 && other.length === 0 ? (
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
          {t("habits.historyEmpty")}
        </Text>
      ) : null}
    </View>
  );
}
