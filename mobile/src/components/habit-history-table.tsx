import React from "react";
import { Text, View } from "react-native";
import { formatLocaleDate } from "@/lib/i18n/core";
import type { HabitHistoryDay } from "@/lib/habit-history";
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

export function HabitHistoryTable({
  days,
  busy,
  onBackfill,
}: {
  days: HabitHistoryDay[];
  busy?: boolean;
  onBackfill?: (date: string, type: "check_in" | "fall") => void | Promise<void>;
}) {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();

  if (days.length === 0) {
    return (
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
        {t("habits.historyEmpty")}
      </Text>
    );
  }

  return (
    <View style={{ marginTop: 4 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 8, textAlign: textStart, writingDirection }}>
        {t("habits.historyLegend")}
      </Text>
      <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: tokens.radiusSm, overflow: "hidden" }}>
        {days.map((day, index) => {
          const color =
            day.status === "success"
              ? c.good
              : day.status === "fall" || day.status === "missed"
                ? c.warn
                : c.muted;
          const label =
            day.status === "success"
              ? t("habits.historySuccess")
              : day.status === "fall"
                ? t("habits.historyFall")
                : day.status === "missed"
                  ? t("habits.historyMissed")
                  : day.status === "pending"
                    ? t("habits.historyPending")
                    : "";

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
                  flexShrink: 0,
                }}
              >
                {formatLocaleDate(locale, day.date)}
              </Text>

              {day.status === "missed" && onBackfill ? (
                <Row style={{ gap: 6, flex: 1, justifyContent: "flex-end" }}>
                  <Btn
                    small
                    label={t("habits.backfillSuccess")}
                    onPress={() => onBackfill(day.date, "check_in")}
                    disabled={busy}
                  />
                  <Btn
                    small
                    variant="warn"
                    label={t("habits.backfillFall")}
                    onPress={() => onBackfill(day.date, "fall")}
                    disabled={busy}
                  />
                </Row>
              ) : (
                <>
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
                </>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
