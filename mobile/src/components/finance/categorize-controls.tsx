import React from "react";
import { Pressable, Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Chip } from "../ui";

export type ExpenseTypeValue = "fixed" | "variable" | "savings";

export function ExpenseTypeChips({
  value,
  onChange,
}: {
  value: ExpenseTypeValue;
  onChange: (val: ExpenseTypeValue) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();

  const options: { id: ExpenseTypeValue; label: string }[] = [
    { id: "variable", label: t("finance.expenseTypeRegular") },
    { id: "fixed", label: t("finance.expenseTypeFixed") },
    { id: "savings", label: t("finance.expenseTypeSavings") },
  ];

  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          color: c.muted,
          fontSize: tokens.textXs,
          marginBottom: 6,
          textAlign: textStart,
          writingDirection,
        }}
      >
        {t("finance.expenseTypeLabel")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => (
          <Chip
            key={opt.id}
            label={opt.label}
            active={value === opt.id}
            onPress={() => onChange(opt.id)}
          />
        ))}
      </View>
    </View>
  );
}

export function RememberRuleToggle({
  value,
  onToggle,
}: {
  value: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();

  return (
    <Pressable
      onPress={onToggle}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: tokens.radiusSm,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 14,
      }}
    >
      <Text style={{ color: c.ink, fontSize: tokens.text, textAlign: textStart, writingDirection }}>
        {t("finance.rememberRule")}
      </Text>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: value ? c.accent : c.border,
          backgroundColor: value ? c.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {value ? (
          <Text style={{ color: c.bg, fontSize: 13, fontWeight: "700", lineHeight: 15 }}>✓</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
