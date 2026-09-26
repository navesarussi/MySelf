import React from "react";
import { Text, View } from "react-native";
import type { MoneyItemType } from "@/lib/finance/money-item-type";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Chip } from "../ui";

const TYPES: MoneyItemType[] = ["variable", "fixed", "income", "internal"];

export function MoneyItemTypeChips({
  value,
  onChange,
}: {
  value: MoneyItemType;
  onChange: (val: MoneyItemType) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();

  const label = (type: MoneyItemType) => t(`finance.moneyType_${type}`);

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>
        {t("finance.moneyTypeLabel")}
      </Text>
      <View style={{ ...row, flexWrap: "wrap", gap: 8 }}>
        {TYPES.map((type) => (
          <Chip key={type} label={label(type)} active={value === type} onPress={() => onChange(type)} />
        ))}
      </View>
    </View>
  );
}
