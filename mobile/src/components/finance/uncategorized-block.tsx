import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../../api/resources";
import { useSession } from "../../session";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { useApiMutation } from "../../query";
import { SectionTitle } from "../ui";
import { saveCategorization, type UncategorizedTxn } from "./categorize-save";
import { UncategorizedQuickRow } from "./uncategorized-quick-row";

export function UncategorizedBlock({
  items,
  expanded,
  onToggle,
  onOpen,
  onCategorized,
}: {
  items: UncategorizedTxn[];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
  onCategorized?: () => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const { token, serverUrl } = useSession();
  const { run, isPending } = useApiMutation();
  const [categories, setCategories] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.financeCategories({ token, serverUrl }).then((res) => setCategories(res.categories)).catch(() => null);
  }, [token, serverUrl]);

  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, 4);

  async function quickCategorize(txn: UncategorizedTxn, category: string) {
    if (!token) return;
    setBusyId(txn.id);
    await run((cfg) => saveCategorization(cfg, txn, category), {
      onSuccess: () => onCategorized?.(),
      onError: () => setBusyId(null),
    });
    setBusyId(null);
  }

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
      <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>
        {t("finance.quickCategorizeHint")}
      </Text>
      {visible.map((txn) => (
        <UncategorizedQuickRow
          key={txn.id}
          txn={txn}
          categories={categories}
          busy={busyId === txn.id || isPending()}
          onQuickCategorize={quickCategorize}
          onOpen={() => onOpen(txn.id)}
        />
      ))}
      {items.length > 4 ? (
        <Pressable onPress={onToggle} accessibilityRole="button" style={{ paddingVertical: 8 }}>
          <Text style={{ color: c.accent, fontWeight: "600", textAlign: textStart, writingDirection }}>
            {expanded ? t("finance.showLess") : t("finance.showMore", { count: String(items.length - 4) })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
