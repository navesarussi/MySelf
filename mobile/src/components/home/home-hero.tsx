import React from "react";
import { Text } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { HeroMetric } from "../ui/hero-metric";

export function HomeHero({ count }: { count: number }) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  return (
    <HeroMetric
      label={t("home.heroLabel")}
      value={String(count)}
      tone={count > 0 ? "warn" : "good"}
      align="start"
    >
      <Text
        style={{
          color: c.muted,
          marginTop: 8,
          fontSize: tokens.textXs,
          textAlign: textStart,
          writingDirection,
        }}
      >
        {count > 0 ? t("home.heroHint") : t("home.heroClear")}
      </Text>
    </HeroMetric>
  );
}
