import React from "react";
import { Linking, Platform, Text, View } from "react-native";
import { api } from "../../api/resources";
import { useApiQuery, queryKeys } from "../../query";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Card, Row, SectionTitle } from "../ui";
import type { FinanceSource } from "@/lib/finance/external-key";
import type { FinanceSourceSummary } from "@/lib/finance/sources-status";

const SOURCE_ORDER: FinanceSource[] = ["leumi", "apple_pay", "max", "visa_cal"];

const SOURCE_NAME_KEY: Record<
  FinanceSource,
  | "finance.sourceLeumi"
  | "finance.sourceApplePay"
  | "finance.sourceMax"
  | "finance.sourceVisaCal"
  | "finance.sourceManual"
> = {
  leumi: "finance.sourceLeumi",
  apple_pay: "finance.sourceApplePay",
  max: "finance.sourceMax",
  visa_cal: "finance.sourceVisaCal",
  manual: "finance.sourceManual",
};

export function FinanceSourcesSettingsSection() {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const statusQ = useApiQuery(queryKeys.financeSourcesStatus, api.financeSourcesStatus);

  const sourcesList: FinanceSourceSummary[] = statusQ.data?.sources ?? [];
  const sourcesMap = new Map<FinanceSource, FinanceSourceSummary>(
    sourcesList.map((s) => [s.source, s])
  );

  const openGuide = () => {
    const guideUrl = "https://github.com/navesarussi/MySelf/blob/main/docs/finance/ios-shortcut-he.md";
    if (Platform.OS === "web") {
      window.open(guideUrl, "_blank");
    } else {
      void Linking.openURL(guideUrl);
    }
  };

  return (
    <>
      <SectionTitle>{t("settings.financeSourcesTitle")}</SectionTitle>
      <Card>
        <Text
          style={{
            color: c.muted,
            fontSize: tokens.textSm,
            textAlign: textStart,
            writingDirection,
            marginBottom: 12,
          }}
        >
          {t("settings.financeSourcesSubtitle")}
        </Text>

        {SOURCE_ORDER.map((sourceKey) => {
          const item = sourcesMap.get(sourceKey);
          const count = item?.count ?? 0;
          const hasActivity = count > 0;
          const sourceName = t(SOURCE_NAME_KEY[sourceKey]);

          return (
            <View
              key={sourceKey}
              style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
              }}
            >
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text
                  style={{
                    color: c.ink,
                    fontWeight: "700",
                    fontSize: tokens.textSm,
                    textAlign: textStart,
                    writingDirection,
                  }}
                >
                  {sourceName}
                </Text>
                <Text
                  style={{
                    color: hasActivity ? c.good : c.muted,
                    fontSize: tokens.textXs,
                    fontWeight: "600",
                  }}
                >
                  {hasActivity
                    ? `✓ ${t("settings.financeSourcesCount", { count })}`
                    : t("settings.financeSourcesNoActivity")}
                </Text>
              </Row>

              {item?.latest_txn_date ? (
                <Text
                  style={{
                    color: c.muted,
                    fontSize: tokens.textXs,
                    textAlign: textStart,
                    writingDirection,
                    marginTop: 4,
                  }}
                >
                  {t("settings.financeSourcesLatestTxn", { date: item.latest_txn_date })}
                </Text>
              ) : null}

              {item?.last_activity_at ? (
                <Text
                  style={{
                    color: c.muted,
                    fontSize: 11,
                    textAlign: textStart,
                    writingDirection,
                    marginTop: 2,
                  }}
                >
                  {t("settings.financeSourcesLastActivity", {
                    date: new Date(item.last_activity_at).toLocaleString(
                      locale === "he" ? "he-IL" : "en-US"
                    ),
                  })}
                </Text>
              ) : null}
            </View>
          );
        })}

        <Row style={{ marginTop: 12 }}>
          <Btn small variant="ghost" label={t("settings.financeSourcesGuideLink")} onPress={openGuide} />
        </Row>
      </Card>
    </>
  );
}
