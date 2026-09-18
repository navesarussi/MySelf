import React, { useMemo } from "react";
import { useRouter } from "expo-router";
import { localeTag, type Locale } from "@/lib/i18n/core";
import { buildHomeKpis, type HomeKpiInput, type HomeKpiSpec } from "@/lib/home-kpis";
import { fmtSignedUsd, fmtUsd } from "@/lib/trading/format";
import { useI18n } from "../../i18n";
import { KpiGrid, type KpiItem } from "../ui/kpi-grid";

function formatSignedIls(n: number, locale: Locale): string {
  const abs = Math.abs(Math.round(n)).toLocaleString(localeTag(locale));
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}₪${abs}`;
}

function displayValue(spec: HomeKpiSpec, locale: Locale): string {
  if (spec.id === "finance-net") return formatSignedIls(Number(spec.value), locale);
  if (spec.id === "trading") return fmtUsd(Number(spec.value));
  return spec.value;
}

function displayHint(spec: HomeKpiSpec, locale: Locale, t: (key: string, params?: Record<string, string | number>) => string): string | undefined {
  if (!spec.hintKey) return undefined;
  if (spec.id === "trading" && spec.hintParams?.pnl != null) {
    return fmtSignedUsd(Number(spec.hintParams.pnl));
  }
  return t(spec.hintKey, spec.hintParams);
}

export function HomeKpiSection({ input }: { input: HomeKpiInput }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const items = useMemo((): KpiItem[] => {
    return buildHomeKpis(input)
      .map((spec) => ({
        id: spec.id,
        label: t(spec.labelKey),
        value: displayValue(spec, locale),
        hint: displayHint(spec, locale, t),
        tone: spec.tone,
        onPress: () => router.push(spec.href),
      }))
      .filter((item) => item.label.trim() && item.value.trim());
  }, [input, t, locale, router]);
  return <KpiGrid items={items} />;
}
