import React from "react";
import { Pressable, Text, View } from "react-native";
import { fmtIls0 } from "@/lib/finance/format";
import { localeTag } from "@/lib/i18n/core";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { ProgressBar } from "../ui/progress-bar";

export type MoneyItemRowProps = {
  title: string;
  subtitle?: string | null;
  category?: string | null;
  planned: number;
  actual: number;
  muted?: boolean;
  statusLabel?: string | null;
  statusTone?: "good" | "warn" | "muted" | "accent";
  onPress?: () => void;
};

export function MoneyItemRow({
  title,
  subtitle,
  category,
  planned,
  actual,
  muted,
  statusLabel,
  statusTone = "muted",
  onPress,
}: MoneyItemRowProps) {
  const { locale, t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const loc = localeTag(locale);
  const over = planned > 0 && actual > planned;
  const ratio = planned > 0 ? Math.min(1, actual / planned) : actual > 0 ? 1 : 0;
  const statusColor =
    statusTone === "good" ? c.good : statusTone === "warn" ? c.warn : statusTone === "accent" ? c.accent : c.muted;

  const content = (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ ...row, alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={2}
            style={{
              color: muted ? c.muted : c.ink,
              fontWeight: "700",
              fontSize: tokens.text,
              textAlign: textStart,
              writingDirection,
            }}
          >
            {title}
          </Text>
          {category ? (
            <View style={{ alignSelf: "flex-start", marginTop: 4 }}>
              <Text
                style={{
                  color: c.accent,
                  fontSize: 11,
                  fontWeight: "600",
                  backgroundColor: c.accent + "18",
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: tokens.radiusSm,
                  overflow: "hidden",
                  textAlign: textStart,
                  writingDirection,
                }}
              >
                {category}
              </Text>
            </View>
          ) : null}
          {subtitle ? (
            <Text
              numberOfLines={2}
              style={{
                color: c.muted,
                fontSize: tokens.textXs,
                marginTop: 4,
                textAlign: textStart,
                writingDirection,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
          {statusLabel ? (
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: "600", marginTop: 4, textAlign: textStart, writingDirection }}>
              {statusLabel}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", flexShrink: 0, minWidth: 72 }}>
          <Text style={{ color: c.muted, fontSize: 11, writingDirection }}>{t("finance.planned")}</Text>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, fontVariant: ["tabular-nums"], writingDirection: "ltr" }}>
            {fmtIls0(planned, loc)}
          </Text>
          <Text style={{ color: c.ink, fontSize: 11, fontWeight: "700", marginTop: 4, writingDirection }}>
            {t("finance.actual")}
          </Text>
          <Text
            style={{
              color: over ? c.warn : c.ink,
              fontSize: tokens.text,
              fontWeight: "800",
              fontVariant: ["tabular-nums"],
              writingDirection: "ltr",
            }}
          >
            {fmtIls0(actual, loc)}
          </Text>
        </View>
      </View>
      <View style={{ marginTop: 8 }}>
        <ProgressBar ratio={ratio} tone={over ? "warn" : "accent"} />
      </View>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {content}
    </Pressable>
  );
}
