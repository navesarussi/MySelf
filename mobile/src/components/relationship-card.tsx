import React from "react";
import { Linking as RNLinking, Pressable, Text, View } from "react-native";
import { differenceInCalendarDays } from "date-fns";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { Badge, Btn, Card, Row } from "./ui";
import { hapticImpact, hapticSelection } from "../haptics";
import { whatsappUrl } from "@/lib/integrations/phone";
import type { Relationship } from "@/lib/types";

function daysSince(r: Pick<Relationship, "last_contact_date">, today: Date): number | null {
  return r.last_contact_date ? differenceInCalendarDays(today, new Date(r.last_contact_date)) : null;
}

function isOverdue(r: Relationship, today: Date): boolean {
  if (r.reminder_days == null) return false;
  const days = daysSince(r, today);
  return days === null || days >= r.reminder_days;
}

export const RelationshipCard = React.memo(function RelationshipCard({
  relationship: r,
  today,
  busy,
  onPress,
  onContactedToday,
}: {
  relationship: Relationship;
  today: Date;
  busy?: boolean;
  onPress: (r: Relationship) => void;
  onContactedToday: (r: Relationship) => void;
}) {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();

  const days = daysSince(r, today);
  const overdue = isOverdue(r, today);
  const wa = r.phone ? whatsappUrl(r.phone) : null;

  return (
    <Card style={overdue ? { borderColor: c.warn } : undefined}>
      <Row>
        <Pressable
          unstable_pressDelay={0}
          style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.7 : 1 }]}
          onPress={() => {
            hapticSelection();
            onPress(r);
          }}
        >
          <Row style={{ justifyContent: "flex-start" }} wrap>
            <Text style={{ color: c.ink, fontWeight: "700", textAlign: textStart, writingDirection }}>
              {r.name}
            </Text>
            {r.group_name ? <Badge label={r.group_name} /> : null}
          </Row>
          <Text
            style={{
              color: overdue ? c.warn : c.muted,
              fontSize: tokens.textXs,
              textAlign: textStart,
              writingDirection,
              marginTop: 2,
            }}
          >
            {days === null ? t("relationships.noContactLogged") : t("relationships.lastContactDays", { days })}
          </Text>
          {r.email ? (
            <Text
              style={{
                color: c.muted,
                fontSize: tokens.textXs,
                textAlign: textStart,
                writingDirection,
                marginTop: 2,
              }}
            >
              {r.email}
            </Text>
          ) : null}
          {r.notes ? (
            <Text
              style={{
                color: c.muted,
                fontSize: tokens.textXs,
                textAlign: textStart,
                writingDirection,
                marginTop: 4,
              }}
            >
              {r.notes}
            </Text>
          ) : null}
        </Pressable>
      </Row>
      <Row style={{ marginTop: 10 }}>
        <Btn
          small
          label={t("relationships.contactedToday")}
          onPress={() => {
            hapticImpact();
            onContactedToday(r);
          }}
          disabled={busy}
        />
        {wa ? (
          <Btn small variant="ghost" label={t("common.whatsapp")} onPress={() => RNLinking.openURL(wa)} />
        ) : null}
      </Row>
    </Card>
  );
});
