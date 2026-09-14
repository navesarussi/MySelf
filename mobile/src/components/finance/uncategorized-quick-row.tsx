import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { fmtAmount2 } from "@/lib/finance/format";
import { quickCategoryOptions } from "@/lib/finance/suggest-txn";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import type { UncategorizedTxn } from "./categorize-save";

export function UncategorizedQuickRow({
  txn,
  categories,
  busy,
  onQuickCategorize,
  onOpen,
}: {
  txn: UncategorizedTxn;
  categories: string[];
  busy?: boolean;
  onQuickCategorize: (txn: UncategorizedTxn, category: string) => void | Promise<void>;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const label = txn.merchant || txn.description;
  const suggested = txn.suggested_category ?? null;
  const chips = useMemo(() => quickCategoryOptions(suggested, categories, 5), [suggested, categories]);

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: c.border,
        paddingVertical: 10,
        opacity: busy ? 0.55 : 1,
      }}
    >
      <Pressable onPress={onOpen} accessibilityRole="button">
        <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }} numberOfLines={1}>
          {txn.kind === "income" ? "+" : "−"}₪{fmtAmount2(txn.amount)} · {label}
        </Text>
        {suggested ? (
          <Text style={{ color: c.accent, fontSize: tokens.textXs, marginTop: 2, textAlign: textStart, writingDirection }}>
            {t("finance.suggestedCategory", { category: suggested })}
          </Text>
        ) : (
          <Text style={{ color: c.warn, fontSize: tokens.textXs, marginTop: 2, textAlign: textStart, writingDirection }}>
            {t("finance.newMerchant")}
          </Text>
        )}
      </Pressable>

      <View style={{ ...row, flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {suggested ? (
          <Pressable
            disabled={busy}
            onPress={() => onQuickCategorize(txn, suggested)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: tokens.radiusSm,
              backgroundColor: c.accent,
            }}
          >
            <Text style={{ color: c.bg, fontWeight: "800", fontSize: tokens.textSm }}>
              {t("finance.confirmSuggestion", { category: suggested })}
            </Text>
          </Pressable>
        ) : null}
        {chips
          .filter((cat) => cat !== suggested)
          .slice(0, suggested ? 3 : 4)
          .map((cat) => (
            <Pressable
              key={cat}
              disabled={busy}
              onPress={() => onQuickCategorize(txn, cat)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: tokens.radiusSm,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.surface,
              }}
            >
              <Text style={{ color: c.ink, fontWeight: "600", fontSize: tokens.textXs }}>{cat}</Text>
            </Pressable>
          ))}
        <Pressable disabled={busy} onPress={onOpen} style={{ paddingVertical: 8, paddingHorizontal: 4 }}>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, fontWeight: "600" }}>{t("finance.moreOptions")}</Text>
        </Pressable>
      </View>
    </View>
  );
}
