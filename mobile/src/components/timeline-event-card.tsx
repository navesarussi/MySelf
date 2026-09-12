import React, { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { Badge, Card, Row } from "./ui";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { displayDescription, displayTitle, isGoogleCalendarEvent } from "@/lib/timeline-display";
import type { TimelineEvent } from "@/lib/types";

export const TimelineEventCard = memo(function TimelineEventCard({
  event,
  onPress,
}: {
  event: TimelineEvent;
  onPress: (ev: TimelineEvent) => void;
}) {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const description = displayDescription(event);

  return (
    <Pressable unstable_pressDelay={0} onPress={() => onPress(event)}>
      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>
              {displayTitle(event)}
            </Text>
            {description ? (
              <Text
                style={{
                  color: c.muted,
                  fontSize: tokens.textXs,
                  textAlign: textStart,
                  writingDirection,
                  marginTop: 2,
                }}
                numberOfLines={2}
              >
                {description}
              </Text>
            ) : null}
            <Row style={{ justifyContent: "flex-start", marginTop: 4 }} wrap>
              {event.category ? <Badge label={event.category} /> : null}
              {isGoogleCalendarEvent(event) ? (
                <Badge label={t("common.fromGoogleCalendar")} tone="accent" />
              ) : null}
            </Row>
          </View>
          <Text style={{ color: c.muted, fontSize: tokens.textXs }}>
            {new Date(event.event_date).toLocaleDateString(locale === "he" ? "he-IL" : "en-US")}
            {event.event_time ? `\n${event.event_time.slice(0, 5)}` : ""}
          </Text>
        </Row>
      </Card>
    </Pressable>
  );
});
