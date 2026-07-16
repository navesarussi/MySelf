import React, { useEffect, useMemo, useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors, tokens } from "../../theme";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useApi, useMutate } from "../../hooks";
import { api } from "../../api/resources";
import { Badge, Btn, Chip, Input, Row, confirmDelete } from "../ui";
import { displayDescription, displayTitle, isGoogleCalendarEvent } from "@/lib/timeline-display";
import { formatEventWhen } from "@/lib/timeline-layout";
import { periodsForEvent, type LifePeriod } from "@/lib/life-periods";
import type { TimelineEvent, TimelineEventLink, TimelineEventLinkKind } from "@/lib/types";

/**
 * Bottom sheet for timeline events. One event opens straight into its detail
 * view; a cluster of events opens a list first. The detail view shows the
 * event's description, containing periods, and its linked content (images,
 * notes, links) — the extensible attachment layer of the timeline.
 */
export function TimelineEventSheet({
  events,
  periods,
  onClose,
  onEdit,
}: {
  events: TimelineEvent[] | null;
  periods: LifePeriod[];
  onClose: () => void;
  onEdit?: (ev: TimelineEvent) => void;
}) {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const [selected, setSelected] = useState<TimelineEvent | null>(null);

  const key = (events ?? []).map((e) => e.id).join(",");
  useEffect(() => {
    setSelected(events && events.length === 1 ? events[0] : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const visible = events !== null && events.length > 0;
  const list = events ?? [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            borderColor: c.border,
            borderWidth: 1,
            maxHeight: "85%",
          }}
        >
          <ScrollView contentContainerStyle={{ padding: tokens.padLg, paddingBottom: 28 }}>
            {selected ? (
              <EventDetail
                event={selected}
                periods={periods}
                showBack={list.length > 1}
                onBack={() => setSelected(null)}
                onClose={onClose}
                onEdit={onEdit}
              />
            ) : (
              <>
                <Text
                  style={{
                    color: c.ink,
                    fontSize: 17,
                    fontWeight: "700",
                    textAlign: textStart,
                    writingDirection,
                    marginBottom: 12,
                  }}
                >
                  {t("timeline.eventsCount", { count: list.length })}
                </Text>
                {list.map((ev) => (
                  <Pressable
                    key={ev.id}
                    onPress={() => setSelected(ev)}
                    style={{
                      borderWidth: 1,
                      borderColor: c.border,
                      borderRadius: tokens.radiusSm,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>
                      {displayTitle(ev)}
                    </Text>
                    <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 2 }}>
                      {formatEventWhen(ev, locale)}
                    </Text>
                  </Pressable>
                ))}
                <Row style={{ marginTop: 8 }}>
                  <Btn label={t("common.close")} variant="ghost" onPress={onClose} />
                </Row>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function EventDetail({
  event,
  periods,
  showBack,
  onBack,
  onClose,
  onEdit,
}: {
  event: TimelineEvent;
  periods: LifePeriod[];
  showBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onEdit?: (ev: TimelineEvent) => void;
}) {
  const c = useColors();
  const { t, locale } = useI18n();
  const { row, textStart, writingDirection } = useLayoutDir();
  const { run, busy } = useMutate();

  const linksQ = useApi(
    (config) => api.eventLinks(config, event.id),
    [event.id]
  );
  const links = linksQ.data ?? [];

  const [addKind, setAddKind] = useState<TimelineEventLinkKind | null>(null);
  const [addValue, setAddValue] = useState("");

  const containing = useMemo(() => periodsForEvent(event, periods), [event, periods]);
  const description = displayDescription(event);

  async function submitLink() {
    if (!addKind || !addValue.trim()) return;
    const body =
      addKind === "note"
        ? { kind: addKind, content: addValue.trim() }
        : { kind: addKind, url: addValue.trim() };
    await run((config) => api.createEventLink(config, event.id, body), {
      success: "flash.linkAdded",
      error: "flash.linkAddError",
    });
    setAddKind(null);
    setAddValue("");
    linksQ.refresh();
  }

  function removeLink(link: TimelineEventLink) {
    confirmDelete(
      t("timeline.deleteLinkConfirm"),
      async () => {
        await run((config) => api.deleteEventLink(config, link.id), {
          success: "flash.linkDeleted",
          error: "flash.linkDeleteError",
        });
        linksQ.refresh();
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  return (
    <View>
      <View style={{ ...row, alignItems: "flex-start", gap: 8 }}>
        {showBack ? (
          <Pressable onPress={onBack} hitSlop={8} style={{ paddingTop: 3 }}>
            <Ionicons name="arrow-back-outline" size={18} color={c.muted} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.ink, fontSize: 17, fontWeight: "700", textAlign: textStart, writingDirection }}>
            {displayTitle(event)}
          </Text>
          <Text style={{ color: c.muted, fontSize: tokens.textSm, textAlign: textStart, writingDirection, marginTop: 3 }}>
            {formatEventWhen(event, locale)}
          </Text>
        </View>
      </View>

      <Row wrap style={{ justifyContent: "flex-start", marginTop: 8 }}>
        {event.category ? <Badge label={event.category} /> : null}
        {isGoogleCalendarEvent(event) ? <Badge label={t("common.fromGoogleCalendar")} tone="accent" /> : null}
        {containing.map((p) => (
          <View
            key={p.id}
            style={{
              borderWidth: 1,
              borderColor: p.color,
              backgroundColor: p.color + "22",
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text style={{ color: c.ink, fontSize: tokens.textXs }}>{p.title}</Text>
          </View>
        ))}
      </Row>

      {description ? (
        <Text style={{ color: c.ink, fontSize: tokens.textSm, textAlign: textStart, writingDirection, marginTop: 10, lineHeight: 20 }}>
          {description}
        </Text>
      ) : null}

      {/* Linked content */}
      <Text style={{ color: c.muted, fontSize: tokens.textXs, fontWeight: "700", textAlign: textStart, writingDirection, marginTop: 16, marginBottom: 6 }}>
        {t("timeline.attachments")}
      </Text>

      {links.length === 0 && !linksQ.loading ? (
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
          {t("timeline.noAttachments")}
        </Text>
      ) : null}

      {links.map((link) => (
        <View
          key={link.id}
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: tokens.radiusSm,
            marginBottom: 8,
            overflow: "hidden",
          }}
        >
          {link.kind === "image" && link.url ? (
            <Pressable onPress={() => Linking.openURL(link.url!).catch(() => {})}>
              <Image source={{ uri: link.url }} style={{ width: "100%", height: 170 }} resizeMode="cover" />
            </Pressable>
          ) : null}
          <View style={{ ...row, padding: 8, gap: 8 }}>
            <Ionicons
              name={link.kind === "image" ? "image-outline" : link.kind === "note" ? "document-text-outline" : "link-outline"}
              size={15}
              color={c.muted}
            />
            {link.kind === "link" && link.url ? (
              <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(link.url!).catch(() => {})}>
                <Text numberOfLines={1} style={{ color: c.accent, fontSize: tokens.textSm }}>
                  {link.url}
                </Text>
              </Pressable>
            ) : (
              <Text style={{ flex: 1, color: c.ink, fontSize: tokens.textSm, textAlign: textStart, writingDirection }}>
                {link.kind === "note" ? link.content : (link.url ?? "")}
              </Text>
            )}
            <Pressable onPress={() => removeLink(link)} hitSlop={8}>
              <Ionicons name="trash-outline" size={15} color={c.muted} />
            </Pressable>
          </View>
        </View>
      ))}

      {/* Add linked content */}
      <Row wrap style={{ justifyContent: "flex-start", marginTop: 4 }}>
        <Chip
          label={t("timeline.linkKindImage")}
          active={addKind === "image"}
          onPress={() => setAddKind(addKind === "image" ? null : "image")}
        />
        <Chip
          label={t("timeline.linkKindNote")}
          active={addKind === "note"}
          onPress={() => setAddKind(addKind === "note" ? null : "note")}
        />
        <Chip
          label={t("timeline.linkKindLink")}
          active={addKind === "link"}
          onPress={() => setAddKind(addKind === "link" ? null : "link")}
        />
      </Row>
      {addKind ? (
        <View style={{ marginTop: 8 }}>
          <Input
            value={addValue}
            onChangeText={setAddValue}
            placeholder={addKind === "note" ? t("timeline.noteContentPlaceholder") : t("timeline.linkUrlPlaceholder")}
            autoCapitalize="none"
            multiline={addKind === "note"}
          />
          <Row>
            <Btn small label={t("common.add")} onPress={submitLink} disabled={busy || !addValue.trim()} />
          </Row>
        </View>
      ) : null}

      <Row style={{ marginTop: 16 }}>
        {onEdit ? (
          <Btn
            label={t("common.edit")}
            onPress={() => {
              onClose();
              onEdit(event);
            }}
          />
        ) : null}
        <Btn label={t("common.close")} variant="ghost" onPress={onClose} />
      </Row>
    </View>
  );
}
