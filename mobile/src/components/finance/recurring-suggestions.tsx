import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api/resources";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { queryClient, queryKeys, useApiMutation, useApiQuery } from "../../query";
import type { RecurringSuggestion } from "@/lib/finance/recurring";

export function RecurringSuggestionsCard({
  month,
  onApplied,
}: {
  month: string;
  onApplied?: () => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { rtl, textStart, writingDirection } = useLayoutDir();
  const { run } = useApiMutation();

  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState<Record<string, boolean>>({});

  const { data, refresh } = useApiQuery(
    queryKeys.financeRecurringSuggestions(month),
    (cfg) => api.financeRecurringSuggestions(cfg, month)
  );

  const rawSuggestions: RecurringSuggestion[] = data?.suggestions ?? [];
  const visible = rawSuggestions.filter((s) => !dismissed[s.merchant_key]);

  if (visible.length === 0) return null;

  async function handleAccept(item: RecurringSuggestion) {
    setApplying((prev) => ({ ...prev, [item.merchant_key]: true }));
    try {
      await run((cfg) =>
        api.applyFinanceRecurringSuggestion(cfg, {
          merchant_key: item.merchant_key,
          category: item.category,
          planned_amount: item.suggested_amount,
        })
      );
      setDismissed((prev) => ({ ...prev, [item.merchant_key]: true }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.financeTransactions(month) });
      void refresh();
      onApplied?.();
    } finally {
      setApplying((prev) => ({ ...prev, [item.merchant_key]: false }));
    }
  }

  function handleDismiss(key: string) {
    setDismissed((prev) => ({ ...prev, [key]: true }));
  }

  return (
    <View
      style={{
        marginBottom: 14,
        padding: 14,
        borderRadius: tokens.radius,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.accent,
      }}
    >
      <View style={{ flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Ionicons name="repeat-outline" size={20} color={c.accent} />
        <Text style={{ color: c.ink, fontWeight: "700", fontSize: tokens.textSm, textAlign: textStart, writingDirection }}>
          {t("finance.recurringTitle")}
        </Text>
      </View>

      <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 12, textAlign: textStart, writingDirection }}>
        {t("finance.recurringSubtitle")}
      </Text>

      {visible.map((item) => {
        const isBusy = Boolean(applying[item.merchant_key]);
        return (
          <View
            key={item.merchant_key}
            style={{
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: c.border,
              flexDirection: rtl ? "row-reverse" : "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.ink, fontWeight: "600", fontSize: tokens.textSm, textAlign: textStart, writingDirection }}>
                {item.display_name}
              </Text>
              <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 2, textAlign: textStart, writingDirection }}>
                ₪{item.suggested_amount.toFixed(0)} · {t("finance.recurringMonthsCount", { count: String(item.occurrences) })}
                {item.category ? ` · ${item.category}` : ""}
              </Text>
            </View>

            <View style={{ flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleAccept(item)}
                disabled={isBusy}
                style={{
                  backgroundColor: c.accent,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 6,
                  opacity: isBusy ? 0.6 : 1,
                }}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: tokens.textXs }}>
                    {t("finance.recurringAccept")}
                  </Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => handleDismiss(item.merchant_key)}
                disabled={isBusy}
                style={{ padding: 6 }}
              >
                <Ionicons name="close" size={18} color={c.muted} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}
