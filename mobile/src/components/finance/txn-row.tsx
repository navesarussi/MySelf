import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { moneyItemTypeFromTxn } from "@/lib/finance/money-item-type";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { txnMerchantDisplay } from "@/lib/finance/merchant-display";
import { fmtIls2 } from "@/lib/finance/format";
import { localeTag } from "@/lib/i18n/core";
import type { FinanceTransaction } from "@/lib/finance/types";

export const FinanceTxnRow = memo(function FinanceTxnRow({
  txn,
  onPress,
  selectionMode,
  selected,
  onToggleSelect,
}: {
  txn: FinanceTransaction;
  onPress: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const c = useColors();
  const { t, locale } = useI18n();
  const loc = localeTag(locale);
  const { textStart, writingDirection, row } = useLayoutDir();
  const income = txn.kind === "income";
  const label = txnMerchantDisplay(txn);
  const when = txn.txn_time ? `${txn.txn_date} ${txn.txn_time}` : txn.txn_date;
  const itemType = moneyItemTypeFromTxn(txn);
  const typeLabel = t(`finance.moneyType_${itemType}`);
  const meta = [when, txn.category, typeLabel, txn.needs_categorization && !txn.category ? "?" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      onPress={selectionMode ? onToggleSelect : onPress}
      onLongPress={onToggleSelect}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${txn.purpose_note ? `(${txn.purpose_note}) ` : ""}${income ? "+" : "−"}${fmtIls2(txn.amount, loc)}`}
      style={({ pressed }) => ({
        ...row,
        justifyContent: "space-between",
        gap: 12,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
        opacity: pressed ? tokens.press : 1,
        backgroundColor: selected ? c.surface : "transparent",
      })}
    >
      {selectionMode ? (
        <Ionicons name={selected ? "checkbox" : "square-outline"} size={20} color={selected ? c.accent : c.muted} />
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: c.ink, fontWeight: "600", fontSize: tokens.text, textAlign: textStart, writingDirection }}>
          {label}
        </Text>
        {txn.purpose_note ? (
          <Text numberOfLines={1} style={{ color: c.ink, fontSize: tokens.textXs, opacity: 0.85, marginTop: 1, textAlign: textStart, writingDirection }}>
            {txn.purpose_note}
          </Text>
        ) : null}
        <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 2, textAlign: textStart, writingDirection }}>
          {meta}
        </Text>
      </View>
      <Text style={{ color: income ? c.good : c.ink, fontWeight: "800", fontSize: tokens.text, fontVariant: ["tabular-nums"], writingDirection: "ltr" }}>
        {`${income ? "+" : "−"}${fmtIls2(txn.amount, loc)}`}
      </Text>
    </Pressable>
  );
});
