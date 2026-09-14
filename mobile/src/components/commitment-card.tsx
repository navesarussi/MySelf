import React from "react";
import { Text, View } from "react-native";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { Badge, Btn, Card, Row } from "./ui";
import { hapticImpact } from "../haptics";
import { formatLocaleDate } from "@/lib/i18n/core";
import type { Commitment } from "@/lib/types";

export const CommitmentCard = React.memo(function CommitmentCard({
  commitment: cm,
  busy,
  onSetStatus,
  onDelete,
}: {
  commitment: Commitment;
  busy?: boolean;
  onSetStatus: (cm: Commitment, status: "done" | "missed") => void;
  onDelete: (cm: Commitment) => void;
}) {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();

  return (
    <Card style={cm.status !== "pending" ? { opacity: 0.6 } : undefined}>
      <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>{cm.text}</Text>
      <Text
        style={{
          color: c.muted,
          fontSize: tokens.textXs,
          textAlign: textStart,
          writingDirection,
          marginTop: 2,
        }}
      >
        {formatLocaleDate(locale, `${cm.commitment_date}T12:00:00`, { weekday: "short", day: "numeric", month: "short" })}
      </Text>
      <Row style={{ marginTop: 8 }}>
        {cm.status === "pending" ? (
          <>
            <Btn
              small
              label={t("common.done")}
              onPress={() => {
                hapticImpact();
                onSetStatus(cm, "done");
              }}
              disabled={busy}
            />
            <Btn
              small
              variant="warn"
              label={t("common.missed")}
              onPress={() => {
                hapticImpact();
                onSetStatus(cm, "missed");
              }}
              disabled={busy}
            />
          </>
        ) : (
          <Badge
            label={cm.status === "done" ? t("common.done") : t("common.missed")}
            tone={cm.status === "done" ? "good" : "warn"}
          />
        )}
        <View style={{ flex: 1 }} />
        <Btn
          small
          variant="ghost"
          label={t("common.delete")}
          onPress={() => onDelete(cm)}
          disabled={busy}
        />
      </Row>
    </Card>
  );
});
