import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { fmtAmount2 } from "@/lib/finance/format";
import { formatMerchantLabel } from "@/lib/finance/merchant-rules-client";
import type { FinanceTransaction } from "@/lib/finance/types";

export const FinanceTxnRow = memo(function FinanceTxnRow({
  txn,
  onPress,
}: {
  txn: FinanceTransaction;
  onPress: () => void;
}) {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, writingDirection, row } = useLayoutDir();
  const income = txn.kind === "income";
  const label = formatMerchantLabel(txn.merchant || txn.description);
  const when = txn.txn_time ? `${txn.txn_date} ${txn.txn_time}` : txn.txn_date;
  const typeLabel =
    txn.expense_type === "fixed"
      ? t("finance.expenseTypeFixed")
      : txn.expense_type === "savings"
        ? t("finance.expenseTypeSavings")
        : txn.expense_type === "variable"
          ? t("finance.expenseTypeRegular")
          : null;
  const meta = [when, txn.category, typeLabel, txn.needs_categorization && !txn.category ? "?" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${txn.purpose_note ? `(${txn.purpose_note}) ` : ""}${income ? "+" : "−"}₪${fmtAmount2(txn.amount)}`}
      style={({ pressed }) => ({
        ...row,
        justifyContent: "space-between",
        gap: 12,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
        opacity: pressed ? tokens.press : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            color: c.ink,
            fontWeight: "600",
            fontSize: tokens.text,
            textAlign: textStart,
            writingDirection,
          }}
        >
          {label}
        </Text>
        {txn.purpose_note ? (
          <Text
            numberOfLines={1}
            style={{
              color: c.ink,
              fontSize: tokens.textXs,
              opacity: 0.85,
              marginTop: 1,
              textAlign: textStart,
              writingDirection,
            }}
          >
            {txn.purpose_note}
          </Text>
        ) : null}
        <Text
          style={{
            color: c.muted,
            fontSize: tokens.textXs,
            marginTop: 2,
            textAlign: textStart,
            writingDirection,
          }}
        >
          {meta}
        </Text>
      </View>
      <Text
        style={{
          color: income ? c.good : c.ink,
          fontWeight: "800",
          fontSize: tokens.text,
          fontVariant: ["tabular-nums"],
          writingDirection: "ltr",
        }}
      >
        {income ? "+" : "−"}₪{fmtAmount2(txn.amount)}
      </Text>
    </Pressable>
  );
});
