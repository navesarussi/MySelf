import React from "react";
import { Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card, SectionTitle } from "../ui";
import type { WeekBucket } from "@/lib/finance/weekly";

export function WeekStrip({ weeks }: { weeks: WeekBucket[] }) {
  const { t } = useI18n();
  const c = useColors();
  const { writingDirection } = useLayoutDir();
  const max = Math.max(...weeks.map((w) => w.expense), 1);

  return (
    <View style={{ marginBottom: 8 }}>
      <SectionTitle>{t("finance.sectionWeeks")}</SectionTitle>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 6 }}>
          {weeks.map((w) => (
            <View key={w.week} style={{ flex: 1, alignItems: "center" }}>
              <View
                style={{
                  width: "100%",
                  height: 56,
                  justifyContent: "flex-end",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: "70%",
                    height: Math.max(4, (w.expense / max) * 48),
                    backgroundColor: c.accent,
                    borderRadius: 4,
                    opacity: w.expense > 0 ? 1 : 0.25,
                  }}
                />
              </View>
              <Text style={{ color: c.muted, fontSize: 9, marginTop: 4, writingDirection }}>
                {w.week}
              </Text>
              <Text style={{ color: c.ink, fontSize: 9, fontWeight: "600", writingDirection }}>
                ₪{w.expense.toFixed(0)}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
