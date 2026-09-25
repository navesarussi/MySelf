import React, { useCallback, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api/resources";
import { useSession } from "../src/session";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { useApiQuery, queryClient, queryKeys } from "../src/query";
import { Btn, Card, ErrorNote, Loading, Screen, SectionTitle } from "../src/components/ui";
import type { FinanceImportBatchRow, ImportUploadSummary } from "@/lib/finance/import/types";

const SOURCE_OPTIONS = [
  { value: "", labelKey: "finance.importSourceAuto" },
  { value: "cal", labelKey: "Cal" },
  { value: "leumi", labelKey: "Leumi" },
  { value: "max", labelKey: "Max" },
  { value: "excel", labelKey: "Excel/CSV" },
] as const;

export default function FinanceImportScreen() {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const router = useRouter();
  const { token, serverUrl } = useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [sourceHint, setSourceHint] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ImportUploadSummary | null>(null);

  const { data: batchesData, loading: batchesLoading, refresh: refreshBatches } = useApiQuery(
    queryKeys.financeImportBatches,
    api.financeImportBatches
  );
  const { data: recentData, loading: recentLoading, refresh: refreshRecent } = useApiQuery(
    queryKeys.financeImportRecent,
    api.financeImportRecent
  );

  const softMissing = batchesData?.soft || recentData?.soft;
  const batches = (batchesData?.batches ?? []) as FinanceImportBatchRow[];
  const recent = recentData?.transactions ?? [];

  const refreshAll = useCallback(() => {
    void refreshBatches();
    void refreshRecent();
    void queryClient.invalidateQueries({ queryKey: queryKeys.financeUncategorized });
  }, [refreshBatches, refreshRecent]);

  async function uploadFile(file: File) {
    if (!token) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await api.financeImportUpload(
        { serverUrl, token },
        file,
        file.name,
        sourceHint ? (sourceHint as "leumi" | "cal" | "max" | "excel" | "manual") : undefined
      );
      setLastResult(result);
      refreshAll();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setUploading(false);
    }
  }

  const onPickWeb = () => {
    if (Platform.OS !== "web") return;
    inputRef.current?.click();
  };

  return (
    <Screen title={t("finance.hubImport")} subtitle={t("finance.importSubtitle")}>
      {softMissing ? (
        <Card style={{ marginBottom: 12, borderColor: c.warn }}>
          <Text style={{ color: c.warn, textAlign: textStart, writingDirection }}>{t("finance.importSoftMissing")}</Text>
        </Card>
      ) : null}

      {Platform.OS === "web" ? (
        <>
          <input
            ref={inputRef as never}
            type="file"
            accept=".pdf,.csv,.xlsx,.xls,text/csv,application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
              e.target.value = "";
            }}
          />
          <Pressable
            onPress={onPickWeb}
            disabled={uploading}
            style={{
              borderWidth: 2,
              borderStyle: "dashed",
              borderColor: c.border,
              borderRadius: tokens.radiusSm,
              padding: 28,
              marginBottom: 12,
              backgroundColor: c.surface,
              opacity: uploading ? 0.6 : 1,
            }}
          >
            <Text style={{ color: c.ink, fontWeight: "700", textAlign: "center", writingDirection }}>
              {uploading ? t("finance.importUploading") : t("finance.importDropzone")}
            </Text>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 6, textAlign: "center" }}>
              {t("finance.importFormats")}
            </Text>
          </Pressable>
        </>
      ) : (
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("finance.importWebOnly")}</Text>
        </Card>
      )}

      <View style={{ ...row, flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, writingDirection }}>{t("finance.importSourceHint")}</Text>
        {SOURCE_OPTIONS.map((opt) => {
          const active = sourceHint === opt.value;
          return (
            <Pressable
              key={opt.value || "auto"}
              onPress={() => setSourceHint(opt.value)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: tokens.radiusSm,
                borderWidth: 1,
                borderColor: active ? c.accent : c.border,
                backgroundColor: c.surface,
              }}
            >
              <Text style={{ color: active ? c.accent : c.ink, fontSize: tokens.textXs }}>
                {opt.labelKey.startsWith("finance.") ? t(opt.labelKey) : opt.labelKey}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {uploadError ? <ErrorNote message={uploadError} /> : null}
      {lastResult ? (
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: c.ink, fontWeight: "700", textAlign: textStart, writingDirection }}>
            {t("finance.importSuccess", { imported: lastResult.imported, skipped: lastResult.skipped })}
          </Text>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 4, textAlign: textStart, writingDirection }}>
            {lastResult.filename} · {lastResult.status}
          </Text>
        </Card>
      ) : null}

      <SectionTitle>{t("finance.importRecentBatches")}</SectionTitle>
      {batchesLoading && batches.length === 0 ? <Loading /> : null}
      {batches.length === 0 && !batchesLoading ? (
        <Text style={{ color: c.muted, marginBottom: 12, textAlign: textStart, writingDirection }}>
          {t("finance.importNoBatches")}
        </Text>
      ) : (
        batches.map((b) => (
          <Card key={b.id} style={{ marginBottom: 8 }}>
            <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>{b.filename}</Text>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 4, textAlign: textStart, writingDirection }}>
              {b.source} · {b.status} · {new Date(b.created_at).toLocaleString(locale === "he" ? "he-IL" : "en-US")}
            </Text>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 2, textAlign: textStart, writingDirection }}>
              {t("finance.importBatchCounts", {
                imported: b.row_counts?.imported ?? 0,
                skipped: b.row_counts?.skipped ?? 0,
              })}
            </Text>
          </Card>
        ))
      )}

      <SectionTitle>{t("finance.importRecentTxns")}</SectionTitle>
      {recentLoading && recent.length === 0 ? <Loading /> : null}
      {recent.map((txn) => (
        <Pressable
          key={txn.id}
          onPress={() => router.push(`/finance-transaction?id=${txn.id}`)}
          style={{
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <View style={{ ...row, justifyContent: "space-between" }}>
            <Text style={{ color: c.ink, flex: 1, textAlign: textStart, writingDirection }} numberOfLines={1}>
              {txn.merchant || txn.description}
            </Text>
            <Text style={{ color: txn.kind === "income" ? c.good : c.ink, fontWeight: "700" }}>
              {txn.kind === "income" ? "+" : "−"}₪{Number(txn.amount).toLocaleString("he-IL")}
            </Text>
          </View>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {txn.txn_date}
            {txn.installment_label ? ` · ${txn.installment_label}` : ""}
            {txn.currency && txn.currency !== "ILS" ? ` · ${txn.currency}` : ""}
          </Text>
        </Pressable>
      ))}

      <View style={{ marginTop: 16 }}>
        <Btn label={t("common.close")} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
