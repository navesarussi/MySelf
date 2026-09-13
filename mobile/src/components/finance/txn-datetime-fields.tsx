import React from "react";
import { Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Input } from "../ui";

export function TxnDateTimeFields({
  txnDate,
  txnTime,
  onDateChange,
  onTimeChange,
}: {
  txnDate: string;
  txnTime: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();

  return (
    <View style={{ marginBottom: 14, gap: 10 }}>
      <Text
        style={{
          color: c.muted,
          fontSize: tokens.textXs,
          textAlign: textStart,
          writingDirection,
        }}
      >
        {t("finance.dateTime")}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1.4 }}>
          <Input
            value={txnDate}
            onChangeText={onDateChange}
            placeholder="YYYY-MM-DD"
            accessibilityLabel={t("finance.txnDate")}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            value={txnTime}
            onChangeText={onTimeChange}
            placeholder="HH:MM"
            accessibilityLabel={t("finance.txnTime")}
          />
        </View>
      </View>
    </View>
  );
}
