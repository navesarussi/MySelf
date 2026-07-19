import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../src/api/resources";
import { useApi, useMutate } from "../../src/hooks";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
import {
  Badge,
  Btn,
  Card,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Loading,
  Row,
  Screen,
  SectionTitle,
  confirmDelete,
} from "../../src/components/ui";
import { FormModal } from "../../src/components/form-modal";
import { TimelineVisual } from "../../src/components/timeline-visual";
import { TimelineEventSheet } from "../../src/components/timeline/event-sheet";
import { displayDescription, displayTitle, isGoogleCalendarEvent } from "@/lib/timeline-display";
import { eventsForPeriod, formatPeriodRange, type LifePeriod } from "@/lib/life-periods";
import type { TimelineEvent } from "@/lib/types";
import { todayISO } from "@/lib/habit-stats";

type EventForm = {
  id?: string;
  event_date: string;
  event_time: string;
  title: string;
  description: string;
  category: string;
  isGoogle?: boolean;
};

type PeriodForm = {
  id?: string;
  title: string;
  start_date: string;
  end_date: string;
  color: string;
  kind: LifePeriod["kind"];
};

const emptyEvent: EventForm = { event_date: "", event_time: "", title: "", description: "", category: "" };
const emptyPeriod: PeriodForm = { title: "", start_date: "", end_date: "", color: "#7dd3c0", kind: "period" };

export default function TimelineScreen() {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, textLtr, writingDirection } = useLayoutDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { run, busy } = useMutate();

  const eventsQ = useApi(api.timelineEvents);
  const periodsQ = useApi(api.periods);
  const syncQ = useApi(api.syncStatus);
  const [eventForm, setEventForm] = useState<EventForm | null>(null);
  const [periodForm, setPeriodForm] = useState<PeriodForm | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [sheetEvents, setSheetEvents] = useState<TimelineEvent[] | null>(null);
  const [expandedPeriodId, setExpandedPeriodId] = useState<string | null>(null);
  const [futureOpen, setFutureOpen] = useState(true);
  const [pastOpen, setPastOpen] = useState(false);

  useEffect(() => {
    if (params.add === "event") setEventForm(emptyEvent);
    if (params.add === "period") setPeriodForm(emptyPeriod);
    if (params.add) router.setParams({ add: "" });
  }, [params.add, router]);

  const events = eventsQ.data ?? [];
  const periods = periodsQ.data ?? [];
  const today = todayISO();

  const chronoBuckets = useMemo(() => {
    const todayEvents: TimelineEvent[] = [];
    const futureEvents: TimelineEvent[] = [];
    const pastEvents: TimelineEvent[] = [];
    for (const ev of events) {
      if (ev.event_date === today) todayEvents.push(ev);
      else if (ev.event_date > today) futureEvents.push(ev);
      else pastEvents.push(ev);
    }
    const byDateAsc = (a: TimelineEvent, b: TimelineEvent) =>
      a.event_date.localeCompare(b.event_date) || (a.event_time || "").localeCompare(b.event_time || "");
    const byDateDesc = (a: TimelineEvent, b: TimelineEvent) =>
      b.event_date.localeCompare(a.event_date) || (b.event_time || "").localeCompare(a.event_time || "");
    todayEvents.sort(byDateAsc);
    futureEvents.sort(byDateAsc);
    pastEvents.sort(byDateDesc);
    return { todayEvents, futureEvents, pastEvents };
  }, [events, today]);

  function refreshAll() {
    eventsQ.refresh();
    periodsQ.refresh();
    syncQ.refresh();
  }

  async function submitEvent() {
    if (!eventForm || !eventForm.title.trim() || !eventForm.event_date.trim()) return;
    const body = {
      event_date: eventForm.event_date,
      event_time: eventForm.event_time || null,
      title: eventForm.title,
      description: eventForm.description || null,
      category: eventForm.category || null,
    };
    if (eventForm.id) await run((config) => api.updateEvent(config, eventForm.id!, body), { success: "flash.eventUpdated", error: "flash.eventUpdateError" });
    else await run((config) => api.createEvent(config, body), { success: "flash.eventAdded", error: "flash.eventAddError" });
    setEventForm(null);
    eventsQ.refresh();
  }

  function removeEvent(ev: TimelineEvent) {
    const google = isGoogleCalendarEvent(ev);
    confirmDelete(
      t("timeline.deleteConfirmEvent", {
        action: google ? t("timeline.hide") : t("common.delete"),
        title: displayTitle(ev),
      }),
      async () => {
        await run((config) => api.deleteEvent(config, ev.id), {
          success: google ? "flash.eventHidden" : "flash.eventDeleted",
          error: google ? "flash.eventHideError" : "flash.eventDeleteError",
        });
        setEventForm(null);
        eventsQ.refresh();
      },
      google ? t("timeline.hideEvent") : t("common.delete"),
      t("common.cancel")
    );
  }

  async function submitPeriod() {
    if (!periodForm || !periodForm.title.trim() || !periodForm.start_date.trim()) return;
    const body = {
      title: periodForm.title,
      start_date: periodForm.start_date,
      end_date: periodForm.end_date || null,
      color: periodForm.color,
      kind: periodForm.kind,
    };
    if (periodForm.id) await run((config) => api.updatePeriod(config, periodForm.id!, body), { success: "flash.periodUpdated", error: "flash.periodUpdateError" });
    else await run((config) => api.createPeriod(config, body), { success: "flash.periodAdded", error: "flash.periodAddError" });
    setPeriodForm(null);
    periodsQ.refresh();
  }

  function removePeriod(p: LifePeriod) {
    confirmDelete(
      t("timeline.deleteConfirmPeriod", { title: p.title }),
      async () => {
        await run((config) => api.deletePeriod(config, p.id), {
          success: "flash.periodDeleted",
          error: "flash.periodDeleteError",
        });
        setPeriodForm(null);
        periodsQ.refresh();
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  async function runSync() {
    setSyncMessage(t("settings.syncing"));
    try {
      const result = await run((config) => api.runSync(config));
      if (result?.ok) {
        setSyncMessage(
          result.alreadyRunning ? t("settings.syncing") : t("flash.calendarSynced", { count: result.imported ?? 0 })
        );
      } else {
        setSyncMessage(t("flash.syncFailed"));
      }
    } catch {
      setSyncMessage(t("flash.syncFailed"));
    }
    refreshAll();
  }

  const loading = eventsQ.loading || periodsQ.loading;

  function openEventForm(ev: TimelineEvent) {
    setEventForm({
      id: ev.id,
      event_date: ev.event_date,
      event_time: ev.event_time ?? "",
      title: displayTitle(ev),
      description: displayDescription(ev) ?? "",
      category: ev.category ?? "",
      isGoogle: isGoogleCalendarEvent(ev),
    });
  }

  function openPeriodForm(p: LifePeriod) {
    setPeriodForm({
      id: p.id,
      title: p.title,
      start_date: p.start_date,
      end_date: p.end_date ?? "",
      color: p.color,
      kind: p.kind,
    });
  }

  function togglePeriodExpand(periodId: string) {
    setExpandedPeriodId((prev) => (prev === periodId ? null : periodId));
  }

  function renderEventCard(ev: TimelineEvent) {
    return (
      <Pressable key={ev.id} onPress={() => openEventForm(ev)}>
        <Card>
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>
                {displayTitle(ev)}
              </Text>
              {displayDescription(ev) ? (
                <Text
                  style={{
                    color: c.muted,
                    fontSize: tokens.textXs,
                    textAlign: textStart,
                    writingDirection,
                    marginTop: 2,
                  }}
                >
                  {displayDescription(ev)}
                </Text>
              ) : null}
              <Row style={{ justifyContent: "flex-start", marginTop: 4 }} wrap>
                {ev.category ? <Badge label={ev.category} /> : null}
                {isGoogleCalendarEvent(ev) ? (
                  <Badge label={t("common.fromGoogleCalendar")} tone="accent" />
                ) : null}
              </Row>
            </View>
            <Text style={{ color: c.muted, fontSize: tokens.textXs }}>
              {new Date(ev.event_date).toLocaleDateString(locale === "he" ? "he-IL" : "en-US")}
              {ev.event_time ? `\n${ev.event_time.slice(0, 5)}` : ""}
            </Text>
          </Row>
        </Card>
      </Pressable>
    );
  }

  function renderPeriodCard(p: LifePeriod) {
    const expanded = expandedPeriodId === p.id;
    const periodEvents = expanded ? eventsForPeriod(events, p) : [];
    return (
      <View key={p.id}>
        <Card style={{ borderColor: p.color, borderStartWidth: 4 }}>
          <Row>
            <Pressable style={{ flex: 1 }} onPress={() => togglePeriodExpand(p.id)}>
              <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>
                {p.title}
              </Text>
              <Text
                style={{
                  color: c.muted,
                  fontSize: tokens.textXs,
                  textAlign: textStart,
                  writingDirection,
                  marginTop: 2,
                }}
              >
                {formatPeriodRange(p, locale)}
                {expanded
                  ? ` · ${t("timeline.eventsCount", { count: periodEvents.length })}`
                  : ""}
              </Text>
            </Pressable>
            <Btn small variant="ghost" label={t("timeline.edit")} onPress={() => openPeriodForm(p)} />
            {p.kind === "milestone_band" ? <Badge label={t("common.milestone")} tone="accent" /> : null}
          </Row>
          {expanded ? (
            <View style={{ marginTop: 8 }}>
              {periodEvents.length === 0 ? (
                <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
                  {t("timeline.noEventsInPeriod")}
                </Text>
              ) : (
                periodEvents.map((ev) => renderEventCard(ev))
              )}
            </View>
          ) : null}
        </Card>
      </View>
    );
  }

  return (
    <Screen
      title={t("timeline.title")}
      subtitle={t("timeline.subtitle")}
      refreshing={loading}
      onRefresh={refreshAll}
    >
      <Row wrap style={{ marginBottom: 12 }}>
        <Btn small label={t("timeline.addEvent")} onPress={() => setEventForm(emptyEvent)} />
        <Btn small variant="ghost" label={t("timeline.addPeriodBtn")} onPress={() => setPeriodForm(emptyPeriod)} />
      </Row>

      {syncQ.data ? (
        <Card>
          <Row>
            <View style={{ flex: 1 }}>
              {syncQ.data.connected ? (
                <>
                  <Text style={{ color: c.ink, fontSize: tokens.textSm, textAlign: textStart, writingDirection }}>
                    {t("settings.googleCalendar")}: {t("settings.connected")} · {syncQ.data.eventCount ?? 0}{" "}
                    {t("common.events")}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 2 }}>
                    {t("timeline.lastSynced")}:{" "}
                    {syncQ.data.lastSyncAt
                      ? new Date(syncQ.data.lastSyncAt).toLocaleString(locale === "he" ? "he-IL" : "en-US")
                      : t("common.notSyncedYet")}
                  </Text>
                </>
              ) : (
                <Text style={{ color: c.muted, fontSize: tokens.textSm, textAlign: textStart, writingDirection }}>
                  {t("timeline.connectGoogle")} — {t("timeline.importHint")}
                </Text>
              )}
              {syncMessage ? (
                <Text style={{ color: c.accent, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 4 }}>
                  {syncMessage}
                </Text>
              ) : null}
            </View>
            {syncQ.data.connected ? (
              <Btn small label={t("common.syncNow")} onPress={runSync} disabled={busy} />
            ) : null}
          </Row>
        </Card>
      ) : null}

      {eventsQ.error ? <ErrorNote message={eventsQ.error} onRetry={eventsQ.refresh} /> : null}
      {loading && !eventsQ.data ? <Loading /> : null}
      {eventsQ.data && events.length === 0 && periods.length === 0 ? (
        <EmptyState text={t("timeline.empty")} />
      ) : null}

      {events.length > 0 || periods.length > 0 ? (
        <TimelineVisual
          events={events}
          periods={periods}
          onEventPress={(ev) => setSheetEvents([ev])}
          onPeriodPress={(p) => setExpandedPeriodId(p.id)}
          onClusterPress={(evs) => setSheetEvents(evs)}
        />
      ) : null}

      <TimelineEventSheet
        events={sheetEvents}
        periods={periods}
        onClose={() => setSheetEvents(null)}
        onEdit={openEventForm}
      />

      {periods.length > 0 ? (
        <>
          <SectionTitle>{t("timeline.byPeriods")}</SectionTitle>
          {periods.map((p) => renderPeriodCard(p))}
        </>
      ) : null}

      <SectionTitle>{t("timeline.chronological")}</SectionTitle>

      <Pressable onPress={() => setFutureOpen((v) => !v)}>
        <Text
          style={{
            color: c.accent,
            fontWeight: "700",
            fontSize: 15,
            textAlign: textStart,
            writingDirection,
            marginVertical: 6,
          }}
        >
          {futureOpen ? "▾ " : "▸ "}
          {t("timeline.futureSection")} ({chronoBuckets.futureEvents.length})
        </Text>
      </Pressable>
      {futureOpen ? chronoBuckets.futureEvents.map((ev) => renderEventCard(ev)) : null}

      <Text
        style={{
          color: c.accent,
          fontWeight: "700",
          fontSize: 15,
          textAlign: textStart,
          writingDirection,
          marginVertical: 6,
        }}
      >
        {t("timeline.todaySection")}
      </Text>
      {chronoBuckets.todayEvents.map((ev) => renderEventCard(ev))}

      <Pressable onPress={() => setPastOpen((v) => !v)}>
        <Text
          style={{
            color: c.accent,
            fontWeight: "700",
            fontSize: 15,
            textAlign: textStart,
            writingDirection,
            marginVertical: 6,
          }}
        >
          {pastOpen ? "▾ " : "▸ "}
          {t("timeline.pastSection")} ({chronoBuckets.pastEvents.length})
        </Text>
      </Pressable>
      {pastOpen ? chronoBuckets.pastEvents.map((ev) => renderEventCard(ev)) : null}

      <FormModal
        visible={eventForm !== null}
        title={eventForm?.id ? t("timeline.editEvent") : t("timeline.addEvent")}
        onClose={() => setEventForm(null)}
        onSubmit={submitEvent}
        submitLabel={eventForm?.id ? t("common.save") : t("common.add")}
        busy={busy}
        onDelete={
          eventForm?.id
            ? () => {
                const ev = events.find((x) => x.id === eventForm.id);
                if (ev) removeEvent(ev);
              }
            : undefined
        }
        deleteLabel={eventForm?.isGoogle ? t("timeline.hideEvent") : t("timeline.deleteEvent")}
      >
        {eventForm ? (
          <View>
            {eventForm.isGoogle ? (
              <Text style={{ color: c.accent2, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginBottom: 8 }}>
                {t("timeline.localOnlyNote")}
              </Text>
            ) : null}
            <Input value={eventForm.title} onChangeText={(v) => setEventForm({ ...eventForm, title: v })} placeholder={t("timeline.eventTitlePlaceholder")} />
            <Label>{`${t("timeline.date")} (YYYY-MM-DD)`}</Label>
            <Input
              value={eventForm.event_date}
              onChangeText={(v) => setEventForm({ ...eventForm, event_date: v })}
              placeholder="2026-07-13"
              autoCapitalize="none"
              style={{ textAlign: textLtr }}
            />
            <Label>{`${t("timeline.time")} (HH:MM)`}</Label>
            <Input
              value={eventForm.event_time}
              onChangeText={(v) => setEventForm({ ...eventForm, event_time: v })}
              placeholder="18:30"
              autoCapitalize="none"
              style={{ textAlign: textLtr }}
            />
            <Input
              value={eventForm.description}
              onChangeText={(v) => setEventForm({ ...eventForm, description: v })}
              placeholder={t("timeline.descriptionPlaceholder")}
              multiline
            />
            {!eventForm.isGoogle ? (
              <Input
                value={eventForm.category}
                onChangeText={(v) => setEventForm({ ...eventForm, category: v })}
                placeholder={t("timeline.categoryPlaceholder")}
              />
            ) : null}
          </View>
        ) : null}
      </FormModal>

      <FormModal
        visible={periodForm !== null}
        title={periodForm?.id ? t("timeline.editPeriod") : t("timeline.addPeriod")}
        onClose={() => setPeriodForm(null)}
        onSubmit={submitPeriod}
        submitLabel={periodForm?.id ? t("common.save") : t("timeline.addPeriodBtn")}
        busy={busy}
        onDelete={
          periodForm?.id
            ? () => {
                const p = periods.find((x) => x.id === periodForm.id);
                if (p) removePeriod(p);
              }
            : undefined
        }
        deleteLabel={t("timeline.deletePeriod")}
      >
        {periodForm ? (
          <View>
            <Input value={periodForm.title} onChangeText={(v) => setPeriodForm({ ...periodForm, title: v })} placeholder={t("timeline.periodNamePlaceholder")} />
            <Label>{`${t("timeline.start")} (YYYY-MM-DD)`}</Label>
            <Input
              value={periodForm.start_date}
              onChangeText={(v) => setPeriodForm({ ...periodForm, start_date: v })}
              placeholder="2020-01-01"
              autoCapitalize="none"
              style={{ textAlign: textLtr }}
            />
            <Label>{`${t("timeline.end")} (${t("timeline.endDateHint")})`}</Label>
            <Input
              value={periodForm.end_date}
              onChangeText={(v) => setPeriodForm({ ...periodForm, end_date: v })}
              placeholder="2023-01-01"
              autoCapitalize="none"
              style={{ textAlign: textLtr }}
            />
            <Label>{t("timeline.kind")}</Label>
            <Row wrap style={{ marginBottom: 8 }}>
              {(["period", "relationship", "milestone_band"] as const).map((k) => (
                <Btn
                  key={k}
                  small
                  variant={periodForm.kind === k ? "primary" : "ghost"}
                  label={
                    k === "period"
                      ? t("timeline.kindPeriod")
                      : k === "relationship"
                        ? t("timeline.kindRelationship")
                        : t("timeline.kindMilestone")
                  }
                  onPress={() => setPeriodForm({ ...periodForm, kind: k })}
                />
              ))}
            </Row>
            <Label>{t("timeline.color")}</Label>
            <Row wrap>
              {["#7dd3c0", "#e8b86d", "#e2725b", "#7dd3a7", "#8ab4f8", "#c58af9"].map((color) => (
                <Pressable
                  key={color}
                  onPress={() => setPeriodForm({ ...periodForm, color })}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    backgroundColor: color,
                    borderWidth: periodForm.color === color ? 3 : 1,
                    borderColor: periodForm.color === color ? c.ink : c.border,
                  }}
                />
              ))}
            </Row>
          </View>
        ) : null}
      </FormModal>
    </Screen>
  );
}
