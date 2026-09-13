import React from "react";
import { Text, View } from "react-native";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { Card, Screen } from "../src/components/ui";

export default function FinanceWealthScreen() {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();

  const placeholders = [
    "finance.wealthPension",
    "finance.wealthInsurance",
    "finance.wealthInvestments",
    "finance.wealthProperty",
  ];

  return (
    <Screen title={t("finance.hubWealth")} subtitle={t("finance.wealthSubtitle")}>
      <Card>
        <Text style={{ color: c.muted, fontSize: tokens.text, textAlign: textStart, writingDirection }}>
          {t("finance.wealthComingBody")}
        </Text>
      </Card>
      {placeholders.map((key) => (
        <View
          key={key}
          style={{
            marginTop: 10,
            padding: 14,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: tokens.radiusSm,
            backgroundColor: c.surface,
          }}
        >
          <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>
            {t(key)}
          </Text>
          <Text style={{ color: c.muted, marginTop: 4, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {t("finance.wealthManualSoon")}
          </Text>
        </View>
      ))}
    </Screen>
  );
}
