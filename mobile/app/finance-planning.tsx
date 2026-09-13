import React from "react";
import { Text, View } from "react-native";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { Card, Screen } from "../src/components/ui";

export default function FinancePlanningScreen() {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();

  return (
    <Screen title={t("finance.hubPlanning")} subtitle={t("finance.planningSubtitle")}>
      <Card>
        <Text style={{ color: c.ink, fontWeight: "700", textAlign: textStart, writingDirection }}>
          {t("finance.planningComingTitle")}
        </Text>
        <Text
          style={{
            color: c.muted,
            marginTop: 8,
            fontSize: tokens.text,
            lineHeight: 22,
            textAlign: textStart,
            writingDirection,
          }}
        >
          {t("finance.planningComingBody")}
        </Text>
      </Card>
    </Screen>
  );
}
