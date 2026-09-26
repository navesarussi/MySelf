import React, { useEffect, useState } from "react";
import { formatUpdatedSecondsAgo, secondsSinceUpdated } from "@/lib/trading/equity-display";
import { useI18n } from "../../i18n";
import { useColors, tokens } from "../../theme";
import { TradingText } from "./blocks";

export function EquityFreshness({ updatedAt, dataUpdatedAt }: { updatedAt?: string | null; dataUpdatedAt?: number }) {
  const { locale } = useI18n();
  const c = useColors();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const sourceAt = updatedAt ?? (dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null);
  const label = formatUpdatedSecondsAgo(secondsSinceUpdated(sourceAt, nowMs), locale);
  if (!label) return null;

  return (
    <TradingText muted size={tokens.textXs} color={c.muted}>
      {label}
    </TradingText>
  );
}
