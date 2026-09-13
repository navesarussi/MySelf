import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  HISTORY_MONTH_DEFAULT,
  HISTORY_MONTH_MAX,
  HISTORY_MONTH_MIN,
  HISTORY_MONTH_PRESETS,
} from "@/lib/finance/history";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Chip, Input, Row } from "../ui";

export function HistoryRangePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (months: number) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function applyCustom() {
    const n = Number(draft);
    if (!Number.isInteger(n) || n < HISTORY_MONTH_MIN || n > HISTORY_MONTH_MAX) return;
    onChange(n);
  }

  const presetActive = (HISTORY_MONTH_PRESETS as readonly number[]).includes(value);

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textSm, textAlign: textStart, writingDirection, marginBottom: 8 }}>
        {t("finance.historyRangeHint")}
      </Text>
      <Row wrap>
        {HISTORY_MONTH_PRESETS.map((n) => (
          <Chip
            key={n}
            label={t("finance.historyMonths", { count: String(n) })}
            active={value === n}
            onPress={() => onChange(n)}
          />
        ))}
      </Row>
      <View style={{ marginTop: 10, gap: 6 }}>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
          {t("finance.historyCustomRange", { min: String(HISTORY_MONTH_MIN), max: String(HISTORY_MONTH_MAX) })}
        </Text>
        <Row>
          <Input
            value={draft}
            onChangeText={setDraft}
            keyboardType="number-pad"
            placeholder={String(HISTORY_MONTH_DEFAULT)}
            onSubmitEditing={applyCustom}
            onBlur={applyCustom}
            style={{ flex: 1, minWidth: 80 }}
          />
          {!presetActive && value >= HISTORY_MONTH_MIN && value <= HISTORY_MONTH_MAX ? (
            <Text style={{ color: c.accent, fontSize: tokens.textXs, alignSelf: "center" }}>
              {t("finance.historyMonths", { count: String(value) })}
            </Text>
          ) : null}
        </Row>
      </View>
    </View>
  );
}
