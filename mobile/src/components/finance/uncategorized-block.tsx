import React from "react";
import { Pressable, Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { SectionTitle } from "../ui";
import { FinanceTxnRow } from "./txn-row";
import type { FinanceTransaction } from "@/lib/finance/types";

export function UncategorizedBlock({
  items,
  expanded,
  onToggle,
  onOpen,
}: {
  items: FinanceTransaction[];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, 4);

  return (
    <View
      style={{
        marginBottom: 14,
        borderWidth: 1,
        borderColor: c.warn,
        borderRadius: tokens.radius,
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 4,
        backgroundColor: c.surface,
      }}
    >
      <SectionTitle>{`${t("finance.uncategorized")} · ${items.length}`}</SectionTitle>
      {visible.map((txn) => (
        <FinanceTxnRow key={txn.id} txn={txn} onPress={() => onOpen(txn.id)} />
      ))}
      {items.length > 4 ? (
        <Pressable onPress={onToggle} accessibilityRole="button" style={{ paddingVertical: 8 }}>
          <Text style={{ color: c.accent, fontWeight: "600", textAlign: textStart, writingDirection }}>
            {expanded
              ? t("finance.showLess")
              : t("finance.showMore", { count: String(items.length - 4) })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
