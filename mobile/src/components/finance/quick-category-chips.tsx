import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { quickCategoryOptions } from "@/lib/finance/suggest-txn";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";

export function QuickCategoryChips({
  categories,
  suggested,
  selected,
  disabled,
  onPick,
}: {
  categories: string[];
  suggested: string | null;
  selected?: string | null;
  disabled?: boolean;
  onPick: (category: string) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const options = useMemo(() => quickCategoryOptions(suggested, categories, 10), [suggested, categories]);

  return (
    <View>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>
        {t("finance.quickCategories")}
      </Text>
      <View style={{ ...row, flexWrap: "wrap", gap: 8 }}>
        {options.map((cat) => {
          const isSuggested = cat === suggested;
          const active = cat === selected;
          return (
            <Pressable
              key={cat}
              disabled={disabled}
              onPress={() => onPick(cat)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: tokens.radiusSm,
                borderWidth: 1.5,
                borderColor: active || isSuggested ? c.accent : c.border,
                backgroundColor: active ? c.accent : isSuggested ? c.accent + "18" : c.surface,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: active ? c.bg : c.ink,
                  fontWeight: isSuggested || active ? "700" : "500",
                  fontSize: tokens.textSm,
                  textAlign: textStart,
                  writingDirection,
                }}
              >
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
