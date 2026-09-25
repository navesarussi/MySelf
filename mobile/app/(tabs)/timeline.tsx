import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, type HomePayload } from "../../src/api/resources";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
import type { InfiniteData } from "@tanstack/react-query";
import {
  useApiQuery,
  useApiMutation,
  useTimelineEvents,
  queryKeys,
  queryClient,
  patchItemInList,
  removeItemFromList,
  patchEventInHome,
  removeEventFromHome,
  patchTimelineEventsCache,
  removeTimelineEventFromCache,
  pollUntilSyncDone,
} from "../../src/query";
import type { TimelineEventsPage } from "../../src/api/resources";
import {
  Badge,
  Btn,
  Card,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  ListSkeleton,
  Row,
  ScreenList,
  SectionTitle,
  confirmDelete,
} from "../../src/components/ui";
import { FormModal } from "../../src/components/form-modal";
import { TimelineVisual } from "../../src/components/timeline-visual";
import { TimelineEventSheet } from "../../src/components/timeline/event-sheet";
import { TimelineEventCard } from "../../src/components/timeline-event-card";
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
  const { run, busy, isPending } = useApiMutation();

  const eventsQ = useTimelineEvents();
  const periodsQ = useApiQuery(queryKeys.periods, api.periods);
  const syncQ = useApiQuery(queryKeys.syncStatus, api.syncStatus);
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

  const events = eventsQ.events;
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

  type ChronoRow =
    | { key: string; kind: "toggle"; section: "future" | "past"; count: number; open: boolean }
    | { key: string; kind: "label" }
    | { key: string; kind: "event"; event: TimelineEvent };

  const chronoRows = useMemo(() => {
    const rows: ChronoRow[] = [];
    rows.push({
      key: "future-toggle",
      kind: "toggle",
      section: "future",
      count: chronoBuckets.futureEvents.length,
      open: futureOpen,
    });
    if (futureOpen) {
      for (const ev of chronoBuckets.futureEvents) {
        rows.push({ key: ev.id, kind: "event", event: ev });
      }
    }
    rows.push({ key: "today-label", kind: "label" });
    for (const ev of chronoBuckets.todayEvents) {
      rows.push({ key: ev.id, kind: "event", event: ev });
    }
    rows.push({
      key: "past-toggle",
      kind: "toggle",
      section: "past",
      count: chronoBuckets.pastEvents.length,
      open: pastOpen,
    });
    if (pastOpen) {
      for (const ev of chronoBuckets.pastEvents) {
        rows.push({ key: ev.id, kind: "event", event: ev });
      }
    }
    return rows;
  }, [chronoBuckets, futureOpen, pastOpen]);

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
    const targetId = eventForm.id;
    setEventForm(null);

    if (targetId) {
      await run((config) => api.updateEvent(config, targetId, body), {
        itemId: targetId,
        flash: { success: "flash.eventUpdated", error: "flash.eventUpdateError" },
        onSuccess: (updated) => {
          if (updated) {
            queryClient.setQueryData<InfiniteData<TimelineEventsPage>>(
              queryKeys.timelineEvents,
              (old) => patchTimelineEventsCache(old, targetId, updated)
            );
            queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
              patchEventInHome(old, targetId, updated)
            );
          }
        },
      });
    } else {
      await run((config) => api.createEvent(config, body), {
        flash: { success: "flash.eventAdded", error: "flash.eventAddError" },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.timelineEvents });
          queryClient.invalidateQueries({ queryKey: queryKeys.home });
        },
      });
    }
  }

  function removeEvent(ev: TimelineEvent) {
    const google = isGoogleCalendarEvent(ev);
    confirmDelete(
      t("timeline.deleteConfirmEvent", {
        action: google ? t("timeline.hide") : t("common.delete"),
        title: displayTitle(ev),
      }),
      async () => {
        const prevEvents = queryClient.getQueryData<InfiniteData<TimelineEventsPage>>(
          queryKeys.timelineEvents
        );
        const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
        queryClient.setQueryData<InfiniteData<TimelineEventsPage>>(queryKeys.timelineEvents, (old) =>
          removeTimelineEventFromCache(old, ev.id)
        );
        queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
          removeEventFromHome(old, ev.id)
        );
        setEventForm(null);

        await run((config) => api.deleteEvent(config, ev.id), {
          itemId: ev.id,
          flash: {
            success: google ? "flash.eventHidden" : "flash.eventDeleted",
            error: google ? "flash.eventHideError" : "flash.eventDeleteError",
          },
          onError: () => {
            if (prevEvents) queryClient.setQueryData(queryKeys.timelineEvents, prevEvents);
            if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
          },
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.timelineEvents });
          },
        });
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
    const targetId = periodForm.id;
    setPeriodForm(null);

    if (targetId) {
      await run((config) => api.updatePeriod(config, targetId, body), {
        itemId: targetId,
        flash: { success: "flash.periodUpdated", error: "flash.periodUpdateError" },
        onSuccess: (updated) => {
          if (updated) {
            queryClient.setQueryData<LifePeriod[]>(queryKeys.periods, (old) =>
              patchItemInList(old, targetId, updated)
            );
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.periods });
        },
      });
    } else {
      await run((config) => api.createPeriod(config, body), {
        flash: { success: "flash.periodAdded", error: "flash.periodAddError" },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.periods });
        },
      });
    }
  }

  function removePeriod(p: LifePeriod) {
    confirmDelete(
      t("timeline.deleteConfirmPeriod", { title: p.title }),
      async () => {
        const prevPeriods = queryClient.getQueryData<LifePeriod[]>(queryKeys.periods);
        queryClient.setQueryData<LifePeriod[]>(queryKeys.periods, (old) =>
          removeItemFromList(old, p.id)
        );
        setPeriodForm(null);

        await run((config) => api.deletePeriod(config, p.id), {
          itemId: p.id,
          flash: {
            success: "flash.periodDeleted",
            error: "flash.periodDeleteError",
          },
          onError: () => {
            if (prevPeriods) queryClient.setQueryData(queryKeys.periods, prevPeriods);
          },
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.periods });
          },
        });
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  async function runSync() {
    setSyncMessage(t("settings.syncing"));
    try {
      const result = await run((config) => api.runSync(config));
      if (!result?.ok) {
        setSyncMessage(t("flash.syncFailed"));
        return;
      }
      if (result.started || result.alreadyRunning) {
        const status = await run((config) => pollUntilSyncDone(config, api.syncStatus));
        if (status?.syncStatus === "completed") {
          setSyncMessage(t("flash.calendarSynced", { count: status.eventCount ?? 0 }));
        } else {
          setSyncMessage(t("flash.syncFailed"));
        }
      } else if (result.imported != null) {
        setSyncMessage(t("flash.calendarSynced", { count: result.imported }));
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.timelineEvents });
    } catch {
      setSyncMessage(t("flash.syncFailed"));
    }
    refreshAll();
  }

  const loading = eventsQ.loading || periodsQ.loading;
  const fetching = eventsQ.isFetching || periodsQ.isFetching;

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
                periodEvents.map((ev) => (
                  <TimelineEventCard key={ev.id} event={ev} onPress={openEventForm} />
                ))
              )}
            </View>
          ) : null}
        </Card>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: tokens.padLg, paddingTop: tokens.padLg }}>
        <Text
          style={{
            color: c.ink,
            fontSize: tokens.title,
            fontWeight: "700",
            textAlign: textStart,
            writingDirection,
          }}
        >
          {t("timeline.title")}
        </Text>
        <Text
          style={{
            color: c.muted,
            fontSize: tokens.subtitle,
            marginTop: 2,
            marginBottom: 12,
            textAlign: textStart,
            writingDirection,
          }}
        >
          {t("timeline.subtitle")}
        </Text>
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
      {loading && events.length === 0 && periods.length === 0 ? (
        <View style={{ marginBottom: 12 }}>
          <ListSkeleton count={1} lines={1} />
          <View style={{ height: 180, marginTop: 10, borderRadius: tokens.radius, backgroundColor: c.border, opacity: 0.55 }} />
        </View>
      ) : null}
      {!loading && events.length === 0 && periods.length === 0 ? (
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
      </View>

      <ScreenList
        data={chronoRows}
        keyExtractor={(row) => row.key}
        estimatedItemSize={96}
        refreshing={fetching}
        onRefresh={refreshAll}
        headerExtra={
          periods.length > 0 ? (
            <View>
              <SectionTitle>{t("timeline.byPeriods")}</SectionTitle>
              {periods.map((p) => renderPeriodCard(p))}
              <SectionTitle>{t("timeline.chronological")}</SectionTitle>
            </View>
          ) : (
            <SectionTitle>{t("timeline.chronological")}</SectionTitle>
          )
        }
        renderItem={({ item }) => {
          if (item.kind === "toggle") {
            const label =
              item.section === "future" ? t("timeline.futureSection") : t("timeline.pastSection");
            return (
              <Pressable
                onPress={() =>
                  item.section === "future" ? setFutureOpen((v) => !v) : setPastOpen((v) => !v)
                }
              >
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
                  {item.open ? "▾ " : "▸ "}
                  {label} ({item.count})
                </Text>
              </Pressable>
            );
          }
          if (item.kind === "label") {
            return (
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
            );
          }
          return <TimelineEventCard event={item.event} onPress={openEventForm} />;
        }}
      />

      <TimelineEventSheet
        events={sheetEvents}
        periods={periods}
        onClose={() => setSheetEvents(null)}
        onEdit={openEventForm}
      />

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
    </View>
  );
}
