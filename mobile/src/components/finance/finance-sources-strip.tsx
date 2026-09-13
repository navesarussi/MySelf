import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../api/resources";
import { useApiQuery, queryKeys } from "../../query";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import type { FinanceSource } from "@/lib/finance/external-key";

const SOURCES: FinanceSource[] = ["leumi", "apple_pay", "max", "visa_cal"];

const LABEL: Record<FinanceSource, string> = {
  leumi: "finance.sourceLeumi",
  apple_pay: "finance.sourceApplePay",
  max: "finance.sourceMax",
  visa_cal: "finance.sourceVisaCal",
  manual: "finance.sourceManual",
};

export function FinanceSourcesStrip() {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const { data } = useApiQuery(queryKeys.financeSourcesStatus, api.financeSourcesStatus);
  const map = new Map((data?.sources ?? []).map((s) => [s.source, s]));

  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          color: c.muted,
          fontSize: tokens.textXs,
          marginBottom: 6,
          textAlign: textStart,
          writingDirection,
        }}
      >
        {t("finance.sourcesStripTitle")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {SOURCES.map((source) => {
          const item = map.get(source);
          const active = (item?.count ?? 0) > 0;
          return (
            <View
              key={source}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: tokens.radiusSm,
                borderWidth: 1,
                borderColor: active ? c.good : c.border,
                backgroundColor: active ? c.good + "18" : c.surface,
              }}
            >
              <Text style={{ color: active ? c.good : c.muted, fontSize: tokens.textXs, fontWeight: "600" }}>
                {active ? "✓ " : ""}
                {t(LABEL[source])}
              </Text>
            </View>
          );
        })}
        <Pressable onPress={() => router.push("/settings")}>
          <Text style={{ color: c.accent, fontSize: tokens.textXs, paddingVertical: 6 }}>
            {t("finance.sourcesStripSettings")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
