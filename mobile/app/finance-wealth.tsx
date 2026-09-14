import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api/resources";
import { useApiQuery, useApiMutation, queryClient, queryKeys } from "../src/query";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import type { WealthCategory, WealthSummary } from "@/lib/finance/wealth-types";
import { Btn, Card, Input, Loading, Screen } from "../src/components/ui";

const CATEGORY_KEYS: Record<WealthCategory, string> = {
  pension: "finance.wealthPension",
  insurance: "finance.wealthInsurance",
  investment: "finance.wealthInvestments",
  property: "finance.wealthProperty",
  other: "finance.wealthOther",
};

export default function FinanceWealthScreen() {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const router = useRouter();
  const { run, isPending } = useApiMutation();
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const { data, loading, refresh } = useApiQuery(queryKeys.financeWealth, api.financeWealth);
  const summary = data as WealthSummary | undefined;

  async function doImport(source: "har_bituach" | "cover_import") {
    if (!importText.trim()) return;
    await run(
      (cfg) => api.importWealthText(cfg, { import_text: importText, source }),
      {
        onSuccess: () => {
          setImportText("");
          setShowImport(false);
          void queryClient.invalidateQueries({ queryKey: queryKeys.financeWealth });
        },
      }
    );
  }

  return (
    <Screen title={t("finance.hubWealth")} subtitle={t("finance.wealthSubtitle")}>
      {loading && !summary ? <Loading /> : null}
      {summary ? (
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {t("finance.wealthTotal")}
          </Text>
          <Text
            style={{
              color: c.ink,
              fontWeight: "800",
              fontSize: 32,
              marginTop: 4,
              textAlign: textStart,
              writingDirection,
            }}
          >
            ₪{summary.total.toLocaleString("he-IL")}
          </Text>
        </Card>
      ) : null}

      {(Object.keys(CATEGORY_KEYS) as WealthCategory[]).map((cat) => {
        const amount = summary?.by_category[cat] ?? 0;
        const items = (summary?.items ?? []).filter((i) => i.category === cat);
        return (
          <View
            key={cat}
            style={{
              marginBottom: 10,
              padding: 14,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: tokens.radiusSm,
              backgroundColor: c.surface,
            }}
          >
            <View style={{ ...row, justifyContent: "space-between" }}>
              <Text style={{ color: c.ink, fontWeight: "700", textAlign: textStart, writingDirection }}>
                {t(CATEGORY_KEYS[cat])}
              </Text>
              <Text style={{ color: c.accent, fontWeight: "800" }}>₪{amount.toLocaleString("he-IL")}</Text>
            </View>
            {items.map((item) => (
              <Text
                key={item.id}
                style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 4, textAlign: textStart, writingDirection }}
              >
                {item.name}
                {item.provider ? ` · ${item.provider}` : ""} — ₪{item.balance.toLocaleString("he-IL")}
              </Text>
            ))}
            {items.length === 0 ? (
              <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 4, textAlign: textStart, writingDirection }}>
                {t("finance.wealthEmptyCategory")}
              </Text>
            ) : null}
          </View>
        );
      })}

      <Pressable onPress={() => router.push("/agent-chat")} style={{ marginTop: 8, marginBottom: 12 }}>
        <Card>
          <Text style={{ color: c.accent, fontWeight: "700", textAlign: textStart, writingDirection }}>
            {t("finance.wealthAgentCta")}
          </Text>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 4, textAlign: textStart, writingDirection }}>
            {t("finance.wealthAgentHint")}
          </Text>
        </Card>
      </Pressable>

      <Btn
        label={showImport ? t("finance.hideImport") : t("finance.pasteImport")}
        variant="ghost"
        onPress={() => setShowImport((v) => !v)}
      />
      {showImport ? (
        <View style={{ marginTop: 10 }}>
          <Input
            value={importText}
            onChangeText={setImportText}
            placeholder={t("finance.importPlaceholder")}
            multiline
          />
          <View style={{ ...row, gap: 8, marginTop: 10 }}>
            <Btn
              label={t("finance.importHarBituach")}
              onPress={() => void doImport("har_bituach")}
              disabled={isPending() || !importText.trim()}
              small
            />
            <Btn
              label={t("finance.importCover")}
              onPress={() => void doImport("cover_import")}
              disabled={isPending() || !importText.trim()}
              small
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
