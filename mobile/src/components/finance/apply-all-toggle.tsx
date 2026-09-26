import React from "react";
import { Pressable, Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";

export function ApplyAllToggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();

  return (
    <Pressable
      onPress={onToggle}
      style={{
        ...row,
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: tokens.radiusSm,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 14,
        backgroundColor: c.surface,
      }}
    >
      <Text style={{ color: c.ink, fontSize: tokens.text, textAlign: textStart, writingDirection, flex: 1 }}>
        {t("finance.applyToAllMerchant")}
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
        {value ? <Text style={{ color: c.bg, fontSize: 13, fontWeight: "700" }}>✓</Text> : null}
      </View>
    </Pressable>
  );
}
