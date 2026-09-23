import React, { useEffect, useState } from "react";
import { Linking, Platform, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "../../api/resources";
import { useApiQuery, queryKeys } from "../../query";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import {
  hasFinanceIngestAuthToken,
  syncFinanceIngestToken,
} from "../../native/finance-ingest-keychain";
import { useColors, tokens } from "../../theme";
import { Btn, Card, Input, Row, SectionTitle } from "../ui";
import type { FinanceSource } from "@/lib/finance/external-key";
import type { FinanceSourceSummary } from "@/lib/finance/types-client";

const SOURCE_ORDER: FinanceSource[] = ["leumi", "apple_pay", "max", "visa_cal"];
const INGEST_TOKEN_KEY = "FINANCE_INGEST_TOKEN";

const SOURCE_NAME_KEY: Record<
  FinanceSource,
  | "finance.sourceLeumi"
  | "finance.sourceApplePay"
  | "finance.sourceMax"
  | "finance.sourceVisaCal"
  | "finance.sourceExcel"
  | "finance.sourceManual"
> = {
  leumi: "finance.sourceLeumi",
  apple_pay: "finance.sourceApplePay",
  max: "finance.sourceMax",
  visa_cal: "finance.sourceVisaCal",
  excel: "finance.sourceExcel",
  manual: "finance.sourceManual",
};

export function FinanceSourcesSettingsSection() {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const statusQ = useApiQuery(queryKeys.financeSourcesStatus, api.financeSourcesStatus);
  const [ingestToken, setIngestToken] = useState("");
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);
  const [hasNativeAuth, setHasNativeAuth] = useState(false);

  const sourcesList: FinanceSourceSummary[] = statusQ.data?.sources ?? [];
  const sourcesMap = new Map<FinanceSource, FinanceSourceSummary>(
    sourcesList.map((s) => [s.source, s])
  );

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(INGEST_TOKEN_KEY);
        if (stored) {
          setIngestToken(stored);
          await syncFinanceIngestToken(stored);
        }
        setHasNativeAuth(await hasFinanceIngestAuthToken());
      } catch {
        /* best-effort */
      }
    })();
  }, []);

  async function saveIngestToken() {
    if (Platform.OS !== "ios") return;
    setIngestBusy(true);
    setIngestMessage(null);
    try {
      const trimmed = ingestToken.trim();
      if (trimmed) {
        await SecureStore.setItemAsync(INGEST_TOKEN_KEY, trimmed);
        await syncFinanceIngestToken(trimmed);
      } else {
        await SecureStore.deleteItemAsync(INGEST_TOKEN_KEY);
        await syncFinanceIngestToken(null);
      }
      setHasNativeAuth(await hasFinanceIngestAuthToken());
      setIngestMessage(t("settings.financeIngestTokenSaved"));
    } catch {
      setIngestMessage(t("settings.financeIngestTokenFailed"));
    } finally {
      setIngestBusy(false);
    }
  }

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

        {Platform.OS === "ios" ? (
          <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border }}>
            <Text
              style={{
                color: c.ink,
                fontWeight: "700",
                fontSize: tokens.textSm,
                textAlign: textStart,
                writingDirection,
                marginBottom: 6,
              }}
            >
              {t("settings.financeIngestTokenTitle")}
            </Text>
            <Text
              style={{
                color: c.muted,
                fontSize: tokens.textXs,
                textAlign: textStart,
                writingDirection,
                marginBottom: 8,
              }}
            >
              {t("settings.financeIngestTokenHint")}
            </Text>
            <Input
              value={ingestToken}
              onChangeText={setIngestToken}
              placeholder={t("settings.financeIngestTokenPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: hasNativeAuth ? c.good : c.muted, fontSize: tokens.textXs }}>
                {hasNativeAuth
                  ? t("settings.financeIngestTokenReady")
                  : t("settings.financeIngestTokenMissing")}
              </Text>
              <Btn
                small
                label={t("common.save")}
                onPress={saveIngestToken}
                disabled={ingestBusy}
              />
            </Row>
            {ingestMessage ? (
              <Text
                style={{
                  color: c.muted,
                  fontSize: tokens.textXs,
                  textAlign: textStart,
                  writingDirection,
                  marginTop: 6,
                }}
              >
                {ingestMessage}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Row style={{ marginTop: 12 }}>
          <Btn small variant="ghost" label={t("settings.financeSourcesGuideLink")} onPress={openGuide} />
        </Row>
      </Card>
    </>
  );
}
