import React, { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { Btn, Row } from "./ui";
import {
  assignEventLanes,
  assignVisiblePeriodLanes,
  axisLineTop,
  eventDateTime,
  periodBarGeom,
  plotBandHeight,
  timelineBounds,
  timelineTicks,
  toTime,
  todayIso,
  tracksHeight,
  xFor,
} from "@/lib/timeline-layout";
import { isEventVisibleAtZoom, spanToZoomLevel } from "@/lib/timeline-zoom";
import { displayTitle } from "@/lib/timeline-display";
import type { LifePeriod } from "@/lib/life-periods";
import type { TimelineEvent } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const EVENT_LANE_H = 20;
const ZOOM_FACTOR = 1.7;

/** The web's zoomable timeline board, ported to RN with a virtual viewport:
 *  only elements inside [viewMin, viewMax] are rendered into a screen-wide
 *  plot, so no giant canvas is ever laid out. Drag pans, pinch/buttons zoom. */
export function TimelineVisual({
  events,
  periods,
  onEventPress,
  onPeriodPress,
}: {
  events: TimelineEvent[];
  periods: LifePeriod[];
  onEventPress: (ev: TimelineEvent) => void;
  onPeriodPress: (p: LifePeriod) => void;
}) {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart } = useLayoutDir();
  const [plotW, setPlotW] = useState(0);

  const bounds = useMemo(() => timelineBounds(events, periods), [events, periods]);
  const [view, setView] = useState<{ min: number; max: number } | null>(null);
  const viewMin = view?.min ?? bounds.min;
  const viewMax = view?.max ?? bounds.max;
  const span = Math.max(viewMax - viewMin, 1);

  // Gesture bookkeeping (kept in refs so PanResponder callbacks stay stable)
  const viewRef = useRef({ min: viewMin, max: viewMax });
  viewRef.current = { min: viewMin, max: viewMax };
  const plotWRef = useRef(plotW);
  plotWRef.current = plotW;
  const gestureStart = useRef({ min: viewMin, max: viewMax, pinchDist: 0 });

  function clampView(min: number, max: number) {
    const fullSpan = (bounds.max - bounds.min) * 1.25;
    let nextSpan = Math.min(Math.max(max - min, 6 * HOUR_MS), fullSpan);
    const center = (min + max) / 2;
    let nextMin = center - nextSpan / 2;
    let nextMax = center + nextSpan / 2;
    const overhang = nextSpan * 0.45;
    if (nextMin < bounds.min - overhang) {
      nextMin = bounds.min - overhang;
      nextMax = nextMin + nextSpan;
    }
    if (nextMax > bounds.max + overhang) {
      nextMax = bounds.max + overhang;
      nextMin = nextMax - nextSpan;
    }
    return { min: nextMin, max: nextMax };
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 6 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        gestureStart.current = {
          ...viewRef.current,
          pinchDist:
            touches.length >= 2
              ? Math.abs(touches[0].pageX - touches[1].pageX)
              : 0,
        };
      },
      onPanResponderMove: (evt, gs) => {
        const width = plotWRef.current;
        if (!width) return;
        const start = gestureStart.current;
        const startSpan = start.max - start.min;
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          const dist = Math.abs(touches[0].pageX - touches[1].pageX);
          if (start.pinchDist === 0) {
            gestureStart.current = { ...start, pinchDist: dist };
            return;
          }
          const scale = Math.max(dist / start.pinchDist, 0.05);
          const center = (start.min + start.max) / 2;
          const nextSpan = startSpan / scale;
          setView(clampView(center - nextSpan / 2, center + nextSpan / 2));
          return;
        }

        const dt = (gs.dx / width) * startSpan;
        setView(clampView(start.min - dt, start.max - dt));
      },
    })
  ).current;

  function zoom(factor: number) {
    const center = (viewMin + viewMax) / 2;
    const nextSpan = span / factor;
    setView(clampView(center - nextSpan / 2, center + nextSpan / 2));
  }

  function fitAll() {
    setView(null);
  }

  // Layout: visible periods packed into lanes, events on the axis
  const { lanes, laneCount } = useMemo(
    () => assignVisiblePeriodLanes(periods, viewMin, viewMax),
    [periods, viewMin, viewMax]
  );
  const tracksH = tracksHeight(laneCount);
  const axisY = axisLineTop(tracksH);
  const today = todayIso();

  const visibleEvents = useMemo(
    () =>
      events.filter((ev) => {
        const time = eventDateTime(ev);
        return time >= viewMin && time <= viewMax && isEventVisibleAtZoom(ev.min_zoom, span);
      }),
    [events, viewMin, viewMax, span]
  );

  const eventItems = useMemo(
    () =>
      visibleEvents.map((ev) => ({
        ev,
        x: xFor(eventDateTime(ev), viewMin, viewMax, plotW || 1),
      })),
    [visibleEvents, viewMin, viewMax, plotW]
  );
  const { lanes: eventLanes, laneCount: eventLaneCount } = useMemo(
    () => assignEventLanes(eventItems.map((i) => ({ id: i.ev.id, x: i.x })), 96),
    [eventItems]
  );

  const ticks = useMemo(
    () => (plotW ? timelineTicks(viewMin, viewMax, plotW) : []),
    [viewMin, viewMax, plotW]
  );

  const boardH = plotBandHeight(tracksH) + eventLaneCount * EVENT_LANE_H + 8;
  const zoomLevel = spanToZoomLevel(span);
  const zoomLabel =
    zoomLevel === "years"
      ? t("common.years")
      : zoomLevel === "months"
        ? t("common.months")
        : zoomLevel === "days"
          ? t("common.days")
          : t("timeline.zoomHours");

  const todayX = plotW ? xFor(toTime(today), viewMin, viewMax, plotW) : -1;

  return (
    <View>
      <Row style={{ marginBottom: 8 }}>
        <Btn small variant="ghost" label={t("timeline.fitAll")} onPress={fitAll} />
        <Btn small variant="ghost" label={`− ${t("timeline.zoomOut")}`} onPress={() => zoom(1 / ZOOM_FACTOR)} />
        <Btn small variant="ghost" label={`+ ${t("timeline.zoomIn")}`} onPress={() => zoom(ZOOM_FACTOR)} />
        <View style={{ flex: 1 }} />
        <Text style={{ color: c.muted, fontSize: tokens.textXs }}>
          {t("timeline.zoomLevel")}: {zoomLabel}
        </Text>
      </Row>

      <View
        onLayout={(e) => setPlotW(e.nativeEvent.layout.width)}
        {...pan.panHandlers}
        style={{
          height: boardH,
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: tokens.radius,
          overflow: "hidden",
        }}
      >
        {plotW > 0 ? (
          <>
            {/* Period bands */}
            {periods.map((p) => {
              const lane = lanes.get(p.id);
              if (lane === undefined) return null;
              const start = xFor(toTime(p.start_date), viewMin, viewMax, plotW);
              const end = xFor(toTime(p.end_date || today), viewMin, viewMax, plotW);
              const left = Math.max(Math.min(start, end), -40);
              const width = Math.max(Math.min(Math.max(start, end), plotW + 40) - left, 6);
              const geom = periodBarGeom(lane);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => onPeriodPress(p)}
                  style={{
                    position: "absolute",
                    left,
                    width,
                    top: geom.top,
                    height: geom.bottom - geom.top,
                    backgroundColor: p.color + "55",
                    borderColor: p.color,
                    borderWidth: 1,
                    borderRadius: 8,
                    justifyContent: "center",
                    paddingHorizontal: 6,
                  }}
                >
                  <Text numberOfLines={1} style={{ color: c.ink, fontSize: 10, fontWeight: "600" }}>
                    {p.title}
                  </Text>
                </Pressable>
              );
            })}

            {/* Axis line */}
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: axisY,
                height: 2,
                backgroundColor: c.border,
              }}
            />

            {/* Today marker */}
            {todayX >= 0 && todayX <= plotW ? (
              <View
                style={{
                  position: "absolute",
                  left: todayX,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  backgroundColor: c.accent2 + "88",
                }}
              />
            ) : null}

            {/* Ticks */}
            {ticks.map((tick) => (
              <View
                key={tick.key}
                style={{ position: "absolute", left: tick.x - 30, width: 60, top: axisY - 26, alignItems: "center" }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: tick.major ? c.ink : c.muted,
                    fontSize: 9,
                    fontWeight: tick.major ? "700" : "400",
                  }}
                >
                  {tick.label}
                </Text>
                <View style={{ width: 1, height: tick.major ? 10 : 6, backgroundColor: c.border, marginTop: 2 }} />
              </View>
            ))}

            {/* Events: dot on the axis + label stacked below */}
            {eventItems.map(({ ev, x }) => {
              const lane = eventLanes.get(ev.id) ?? 0;
              const labelTop = axisY + 14 + lane * EVENT_LANE_H;
              const google = ev.source === "google_calendar";
              return (
                <React.Fragment key={ev.id}>
                  <Pressable
                    onPress={() => onEventPress(ev)}
                    hitSlop={8}
                    style={{
                      position: "absolute",
                      left: x - 5,
                      top: axisY - 4,
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: google ? c.accent2 : c.accent,
                      borderWidth: 1,
                      borderColor: c.bg,
                    }}
                  />
                  <Pressable
                    onPress={() => onEventPress(ev)}
                    style={{ position: "absolute", left: Math.max(x - 48, 0), top: labelTop, width: 96 }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{ color: c.muted, fontSize: 9, textAlign: "center" }}
                    >
                      {displayTitle(ev)}
                    </Text>
                    <Text style={{ color: c.border, fontSize: 8, textAlign: "center" }}>
                      {new Date(ev.event_date).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
                        year: "2-digit",
                        month: "numeric",
                        day: "numeric",
                      })}
                    </Text>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </>
        ) : null}
      </View>

      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, marginTop: 6 }}>
        {t("timeline.clickToEdit")} · {t("timeline.minZoomHint")}
      </Text>
    </View>
  );
}
