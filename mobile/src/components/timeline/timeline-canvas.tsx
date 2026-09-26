import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  PanGestureHandler,
  PinchGestureHandler,
  TapGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
  type TapGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useColors, tokens } from "../../theme";
import { useI18n } from "../../i18n";
import {
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
import {
  assignClusterLanes,
  clampSpanX,
  clusterEvents,
  clusterZoomTarget,
  dedupeEvents,
  densityBins,
  stablePeriodLanes,
  timeWindow,
  visibleLabelSegment,
  type TimelineCluster,
} from "@/lib/timeline-engine";
import { isEventVisibleAtZoom, spanToZoomLevel, type TimelineZoomLevel } from "@/lib/timeline-zoom";
import { displayTitle } from "@/lib/timeline-display";
import type { LifePeriod } from "@/lib/life-periods";
import type { TimelineEvent } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const EVENT_LANE_H = 30;
/** Space between the axis and the first label lane. */
const LABEL_TOP_GAP = 16;
/** Label lanes the layout reserves when centering the board vertically. The
 *  axis position no longer depends on how many lanes the current zoom needs —
 *  it used to, so the whole board bobbed up and down while zooming. */
const RESERVED_LABEL_LANES = 3;
/** Label lanes a short board keeps by compressing the period tracks. */
const MIN_LABEL_LANES = 2;
/** Width of one density-strip column. */
const DENSITY_BIN_PX = 4;
const DENSITY_MAX_H = 9;
const CLUSTER_GAP_PX = 44;
const LABEL_GAP_PX = 120;
const MIN_SPAN_MS = 3 * HOUR_MS;
const MILESTONE_CATEGORY = "אבן דרך";

type Win = { min: number; max: number };

/** Events you entered or marked as milestones, as opposed to calendar entries. */
function isFeaturedEvent(ev: TimelineEvent) {
  return ev.source !== "google_calendar" || ev.category === MILESTONE_CATEGORY;
}

function haptic(kind: "select" | "light") {
  if (Platform.OS === "web") return;
  if (kind === "select") Haptics.selectionAsync().catch(() => {});
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/**
 * Gesture-driven timeline board backed by the pure lib/timeline-engine layout:
 * period lanes are stable (viewport-independent), overlapping events collapse
 * into tappable clusters, duplicate rows render once with a ×N badge, and all
 * geometry is clamped so deep zoom stays pixel-accurate. Live panning uses a
 * native-driver translate; programmatic moves ease via requestAnimationFrame.
 */
export function TimelineCanvas({
  events,
  periods,
  height,
  fullscreen = false,
  onEventPress,
  onPeriodPress,
  onClusterPress,
}: {
  events: TimelineEvent[];
  periods: LifePeriod[];
  height: number;
  fullscreen?: boolean;
  onEventPress?: (ev: TimelineEvent) => void;
  onPeriodPress?: (p: LifePeriod) => void;
  onClusterPress?: (events: TimelineEvent[]) => void;
}) {
  const c = useColors();
  const { t, locale } = useI18n();
  const localeTag = locale === "he" ? "he-IL" : "en-US";

  const today = todayIso();
  const deduped = useMemo(() => dedupeEvents(events), [events]);
  // dedupeEvents sorts by time, so this is an ascending index for binary search.
  const times = useMemo(() => deduped.events.map(eventDateTime), [deduped.events]);
  const bounds = useMemo(() => timelineBounds(deduped.events, periods), [deduped.events, periods]);
  const [view, setView] = useState<Win>(() => ({ min: bounds.min, max: bounds.max }));
  const deferredView = useDeferredValue(view);
  const [plotW, setPlotW] = useState(0);

  // Follow the data range (first load, a sync that adds older or later events)
  // until the user moves the view. Re-fitting after that threw away their
  // zoom and position whenever a background refresh changed the range.
  const userMovedRef = useRef(false);
  useEffect(() => {
    if (userMovedRef.current) return;
    setView({ min: bounds.min, max: bounds.max });
  }, [bounds.min, bounds.max]);

  const viewRef = useRef(view);
  viewRef.current = view;
  const plotWRef = useRef(plotW);
  plotWRef.current = plotW;
  const panX = useRef(new Animated.Value(0)).current;
  const pinchStart = useRef<Win>(view);
  const zoomLevelRef = useRef<TimelineZoomLevel>(spanToZoomLevel(view.max - view.min));
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const clampView = useCallback(
    (min: number, max: number): Win => {
      const fullSpan = (bounds.max - bounds.min) * 1.4;
      const nextSpan = Math.min(Math.max(max - min, MIN_SPAN_MS), Math.max(fullSpan, 2 * MIN_SPAN_MS));
      const center = (min + max) / 2;
      let nextMin = center - nextSpan / 2;
      let nextMax = center + nextSpan / 2;
      const overhang = nextSpan * 0.5;
      if (nextMin < bounds.min - overhang) {
        nextMin = bounds.min - overhang;
        nextMax = nextMin + nextSpan;
      }
      if (nextMax > bounds.max + overhang) {
        nextMax = bounds.max + overhang;
        nextMin = nextMax - nextSpan;
      }
      return { min: nextMin, max: nextMax };
    },
    [bounds.min, bounds.max]
  );

  const maybeHaptic = useCallback((v: Win) => {
    const level = spanToZoomLevel(v.max - v.min);
    if (level !== zoomLevelRef.current) {
      zoomLevelRef.current = level;
      haptic("select");
    }
  }, []);

  const animateViewTo = useCallback(
    (target: Win, duration = 300) => {
      userMovedRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const start = viewRef.current;
      const t0 = Date.now();
      const step = () => {
        const p = Math.min((Date.now() - t0) / duration, 1);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        const next = {
          min: start.min + (target.min - start.min) * e,
          max: start.max + (target.max - start.max) * e,
        };
        setView(next);
        maybeHaptic(next);
        if (p < 1) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [maybeHaptic]
  );

  const zoomBy = useCallback(
    (factor: number, anchor = 0.5) => {
      const { min, max } = viewRef.current;
      const span = max - min;
      const focus = min + span * anchor;
      const nextSpan = span / factor;
      animateViewTo(clampView(focus - nextSpan * anchor, focus + nextSpan * (1 - anchor)));
    },
    [animateViewTo, clampView]
  );

  const fitAll = useCallback(() => {
    animateViewTo({ min: bounds.min, max: bounds.max });
    // Fitting everything means "follow the data" again.
    userMovedRef.current = false;
    haptic("light");
  }, [animateViewTo, bounds.min, bounds.max]);

  const goToToday = useCallback(() => {
    const { min, max } = viewRef.current;
    const span = max - min;
    const center = Date.now();
    animateViewTo(clampView(center - span / 2, center + span / 2));
    haptic("light");
  }, [animateViewTo, clampView]);

  const openCluster = useCallback(
    (cluster: TimelineCluster) => {
      haptic("light");
      if (cluster.events.length === 1) {
        onEventPress?.(cluster.events[0]);
        return;
      }
      // Zoom in until the cluster splits; when its members share (almost) the
      // same instant, zooming can't separate them — hand the list to the host.
      if (cluster.timeMax - cluster.timeMin < MIN_SPAN_MS) {
        if (onClusterPress) onClusterPress(cluster.events);
        else onEventPress?.(cluster.events[0]);
        return;
      }
      const target = clusterZoomTarget(cluster, MIN_SPAN_MS);
      animateViewTo(clampView(target.min, target.max));
    },
    [animateViewTo, clampView, onClusterPress, onEventPress]
  );

  const eventsLabel = useCallback((n: number) => t("timeline.eventsCount", { count: n }), [t]);

  // --- Pan (native-driver translate during drag, commit + momentum on release) ---
  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const doubleTapRef = useRef(null);

  const onPanEvent = useRef(
    Animated.event([{ nativeEvent: { translationX: panX } }], { useNativeDriver: true })
  ).current as (e: PanGestureHandlerGestureEvent) => void;

  const onPanStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = e.nativeEvent;
      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        const w = plotWRef.current || 1;
        const span = viewRef.current.max - viewRef.current.min;
        const dtMove = (translationX / w) * span;
        panX.setValue(0);
        const committed = clampView(viewRef.current.min - dtMove, viewRef.current.max - dtMove);
        userMovedRef.current = true;
        setView(committed);
        if (Math.abs(velocityX) > 250) {
          const dtVel = (velocityX / w) * span * 0.28;
          animateViewTo(clampView(committed.min - dtVel, committed.max - dtVel), 420);
        }
      }
    },
    [animateViewTo, clampView, panX]
  );

  // --- Pinch (focal-anchored zoom) ---
  const onPinchStateChange = useCallback((e: PinchGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.BEGAN || e.nativeEvent.oldState === State.BEGAN) {
      pinchStart.current = viewRef.current;
    }
  }, []);

  const onPinchEvent = useCallback(
    (e: PinchGestureHandlerGestureEvent) => {
      const { scale, focalX } = e.nativeEvent;
      const w = plotWRef.current || 1;
      const start = pinchStart.current;
      const startSpan = start.max - start.min;
      const anchor = Math.min(Math.max(focalX / w, 0), 1);
      const focus = start.min + startSpan * anchor;
      const nextSpan = startSpan / Math.max(scale, 0.05);
      const next = clampView(focus - nextSpan * anchor, focus + nextSpan * (1 - anchor));
      userMovedRef.current = true;
      setView(next);
      maybeHaptic(next);
    },
    [clampView, maybeHaptic]
  );

  const onDoubleTap = useCallback(
    (e: TapGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state === State.ACTIVE) {
        const w = plotWRef.current || 1;
        const anchor = Math.min(Math.max(e.nativeEvent.x / w, 0), 1);
        zoomBy(2.4, anchor);
        haptic("light");
      }
    },
    [zoomBy]
  );

  // --- Layout (all math from lib/timeline-engine — stable across pan/zoom) ---
  const span = deferredView.max - deferredView.min;
  const padMin = deferredView.min - span;
  const padMax = deferredView.max + span;

  const { lanes, laneCount } = useMemo(() => stablePeriodLanes(periods, today), [periods, today]);
  // Short boards (landscape full screen is ~250pt) compress the period tracks,
  // down to half, so at least two label lanes always fit under the axis.
  const fullTracksH = tracksHeight(laneCount);
  const minBelowAxis = LABEL_TOP_GAP + MIN_LABEL_LANES * EVENT_LANE_H + 12;
  const trackScale = Math.min(
    1,
    Math.max(0.5, (height - minBelowAxis - axisLineTop(0) - 8) / fullTracksH)
  );
  const tracksH = fullTracksH * trackScale;
  const intrinsicAxisY = axisLineTop(tracksH);

  const zoomLevel = spanToZoomLevel(span);

  // Only events in the rendered window (the view plus one span either side for
  // panning) are clustered — a binary search, not a pass over every event.
  const windowEvents = useMemo(() => {
    const { start, end } = timeWindow(times, padMin, padMax);
    return deduped.events.slice(start, end);
  }, [times, deduped.events, padMin, padMax]);

  // Your own events and milestones are clustered apart from calendar entries,
  // so a busy calendar never swallows them into a count chip.
  const clusters = useMemo(() => {
    if (!plotW) return [];
    const featured: TimelineEvent[] = [];
    const calendar: TimelineEvent[] = [];
    for (const ev of windowEvents) {
      if (!isEventVisibleAtZoom(ev.min_zoom, span)) continue;
      (isFeaturedEvent(ev) ? featured : calendar).push(ev);
    }
    const make = (list: TimelineEvent[]) =>
      clusterEvents(list, deferredView.min, deferredView.max, plotW, CLUSTER_GAP_PX);
    // Calendar first, so featured markers draw on top where they meet.
    return [...make(calendar), ...make(featured)];
    // span only matters through the zoom level it maps to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowEvents, zoomLevel, deferredView.min, deferredView.max, plotW]);

  // Every event — including the ones too detailed for this zoom — as a
  // density strip under the axis, so busy stretches read at a glance.
  const density = useMemo(() => {
    if (!plotW) return null;
    const bins = Math.ceil((plotW * 3) / DENSITY_BIN_PX);
    const counts = densityBins(times, padMin, padMax, bins);
    let max = 0;
    for (const n of counts) if (n > max) max = n;
    return max > 0 ? { counts, max } : null;
  }, [times, padMin, padMax, plotW]);

  const { lanes: clusterLanes } = useMemo(
    () =>
      assignClusterLanes(
        [...clusters].sort((a, b) => a.x - b.x),
        LABEL_GAP_PX,
        (cl) => cl.events.every(isFeaturedEvent)
      ),
    [clusters]
  );

  const intrinsicH = intrinsicAxisY + LABEL_TOP_GAP + RESERVED_LABEL_LANES * EVENT_LANE_H + 12;
  const topPad = Math.max((height - intrinsicH) / 2, 8);
  const axisY = topPad + intrinsicAxisY;
  // Lanes that fit under the axis; clusters in deeper lanes keep their dot and
  // drop the label instead of spilling out of the board.
  const labelLanes = Math.max(Math.floor((height - axisY - LABEL_TOP_GAP - 8) / EVENT_LANE_H), 0);

  // Ticks generated over a 3-span overscan window so edges stay populated mid-drag.
  const ticks = useMemo(() => {
    if (!plotW) return [];
    return timelineTicks(padMin, padMax, plotW * 3, localeTag).map((tk) => ({
      ...tk,
      x: tk.x - plotW,
      labelX: tk.labelX - plotW,
    }));
  }, [padMin, padMax, plotW, localeTag]);

  // "Now", not noon of today: at hour zoom the marker is read against the hour lines.
  const nowX = plotW ? xFor(Date.now(), deferredView.min, deferredView.max, plotW) : -1;
  const zoomLabel =
    zoomLevel === "years"
      ? t("common.years")
      : zoomLevel === "months"
        ? t("common.months")
        : zoomLevel === "days"
          ? t("common.days")
          : t("timeline.zoomHours");

  function onLayout(e: LayoutChangeEvent) {
    setPlotW(e.nativeEvent.layout.width);
  }

  return (
    <View>
      {/* Controls */}
      <View style={[styles.controls, { borderColor: c.border }]}>
        <ControlBtn icon="scan-outline" label={t("timeline.fitAll")} onPress={fitAll} color={c} />
        <ControlBtn icon="locate-outline" label={t("timeline.today")} onPress={goToToday} color={c} />
        <ControlBtn icon="remove-outline" onPress={() => zoomBy(1 / 1.8)} color={c} />
        <ControlBtn icon="add-outline" onPress={() => zoomBy(1.8)} color={c} />
        <View style={{ flex: 1 }} />
        <View style={[styles.zoomChip, { backgroundColor: c.accent + "22", borderColor: c.accent + "55" }]}>
          <Ionicons name="search-outline" size={11} color={c.accent} />
          <Text style={{ color: c.accent, fontSize: 11, fontWeight: "700" }}>{zoomLabel}</Text>
        </View>
      </View>

      {/* Board */}
      <PinchGestureHandler
        ref={pinchRef}
        simultaneousHandlers={panRef}
        onGestureEvent={onPinchEvent}
        onHandlerStateChange={onPinchStateChange}
      >
        <Animated.View>
          <PanGestureHandler
            ref={panRef}
            simultaneousHandlers={pinchRef}
            activeOffsetX={[-8, 8]}
            onGestureEvent={onPanEvent}
            onHandlerStateChange={onPanStateChange}
          >
            <Animated.View
              onLayout={onLayout}
              style={{
                // Time runs left to right whatever the app's direction. Under
                // RTL, iOS mirrored every absolute `left` while the pan, pinch
                // and tap math stayed left-to-right: a drag snapped the other
                // way on release and pinch zoomed around the mirrored point.
                direction: "ltr",
                height,
                borderRadius: fullscreen ? 0 : tokens.radius,
                borderWidth: fullscreen ? 0 : 1,
                borderColor: c.border,
                overflow: "hidden",
              }}
            >
              <LinearGradient
                colors={[c.surface, c.bg]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <TapGestureHandler ref={doubleTapRef} numberOfTaps={2} onHandlerStateChange={onDoubleTap}>
                <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: panX }] }]}>
                  {plotW > 0 ? (
                    <>
                      {/* Vertical grid at major ticks */}
                      {ticks
                        .filter((tk) => tk.major)
                        .map((tk) => (
                          <View
                            key={`grid-${tk.key}`}
                            style={{
                              position: "absolute",
                              left: tk.x,
                              top: 0,
                              bottom: 0,
                              width: StyleSheet.hairlineWidth,
                              backgroundColor: c.border + "55",
                            }}
                          />
                        ))}

                      {/* Period bands (stable lanes, clamped geometry, sticky labels) */}
                      {periods.map((p) => {
                        const lane = lanes.get(p.id);
                        if (lane === undefined) return null;
                        const startX = xFor(toTime(p.start_date), deferredView.min, deferredView.max, plotW);
                        const endX = xFor(toTime(p.end_date || today), deferredView.min, deferredView.max, plotW);
                        const spanPx = clampSpanX(startX, endX, plotW);
                        if (!spanPx) return null;
                        const geom = periodBarGeom(lane);
                        const label = visibleLabelSegment(spanPx.left, spanPx.left + spanPx.width, plotW);
                        const ongoing = !p.end_date;
                        return (
                          <Pressable
                            key={p.id}
                            onPress={() => onPeriodPress?.(p)}
                            style={{
                              position: "absolute",
                              left: spanPx.left,
                              width: spanPx.width,
                              top: topPad + geom.top * trackScale,
                              height: (geom.bottom - geom.top) * trackScale,
                              borderRadius: 9,
                              borderTopStartRadius: spanPx.clippedStart ? 0 : 9,
                              borderBottomStartRadius: spanPx.clippedStart ? 0 : 9,
                              borderTopEndRadius: spanPx.clippedEnd || ongoing ? 0 : 9,
                              borderBottomEndRadius: spanPx.clippedEnd || ongoing ? 0 : 9,
                              borderWidth: 1,
                              borderColor: p.color,
                              overflow: "hidden",
                              justifyContent: "center",
                            }}
                          >
                            <LinearGradient
                              colors={[p.color + "66", p.color + "22"]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 1 }}
                              style={StyleSheet.absoluteFill}
                            />
                            {label ? (
                              <View
                                pointerEvents="none"
                                style={{
                                  position: "absolute",
                                  left: label.left - spanPx.left,
                                  width: label.width,
                                  alignItems: "center",
                                }}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    color: c.ink,
                                    fontSize: trackScale < 0.7 ? 10 : 11,
                                    fontWeight: "700",
                                    maxWidth: label.width,
                                  }}
                                >
                                  {p.title}
                                </Text>
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}

                      {/* Axis line */}
                      <View
                        style={{
                          position: "absolute",
                          left: -plotW,
                          right: -plotW,
                          top: axisY,
                          height: 1.5,
                          backgroundColor: c.muted + "88",
                        }}
                      />

                      {/* Density strip: every event, including those too detailed for this zoom */}
                      {density
                        ? density.counts.map((n, i) =>
                            n === 0 ? null : (
                              <View
                                key={`dn-${i}`}
                                pointerEvents="none"
                                style={{
                                  position: "absolute",
                                  left: i * DENSITY_BIN_PX - plotW,
                                  width: DENSITY_BIN_PX - 1,
                                  top: axisY + 3,
                                  height: 2 + Math.sqrt(n / density.max) * DENSITY_MAX_H,
                                  borderBottomLeftRadius: 1,
                                  borderBottomRightRadius: 1,
                                  backgroundColor: c.accent,
                                  opacity: 0.18 + 0.42 * Math.sqrt(n / density.max),
                                }}
                              />
                            )
                          )
                        : null}

                      {/* Ticks: line at the boundary, label centered in its unit */}
                      {ticks.map((tick) => (
                        <React.Fragment key={tick.key}>
                          <View
                            pointerEvents="none"
                            style={{
                              position: "absolute",
                              left: tick.x - StyleSheet.hairlineWidth,
                              top: axisY - (tick.major ? 9 : 5),
                              width: tick.major ? 1.5 : 1,
                              height: tick.major ? 9 : 5,
                              backgroundColor: tick.major ? c.muted : c.border,
                            }}
                          />
                          <View
                            pointerEvents="none"
                            style={{ position: "absolute", left: tick.labelX - 44, width: 88, top: axisY - 26, alignItems: "center" }}
                          >
                            <Text
                              numberOfLines={1}
                              style={{
                                color: tick.major ? c.ink : c.muted,
                                fontSize: tick.major ? 11 : 10,
                                fontWeight: tick.major ? "700" : "500",
                                fontVariant: ["tabular-nums"],
                              }}
                            >
                              {tick.label}
                            </Text>
                          </View>
                        </React.Fragment>
                      ))}

                      {/* Now marker */}
                      {nowX >= -plotW && nowX <= plotW * 2 ? (
                        <View
                          pointerEvents="none"
                          style={{ position: "absolute", left: nowX - 30, width: 60, top: 0, bottom: 0, alignItems: "center" }}
                        >
                          <View style={{ position: "absolute", top: 22, bottom: 0, width: 1.5, backgroundColor: c.accent2 }} />
                          <View
                            style={{
                              position: "absolute",
                              top: axisY - 4,
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: c.accent2,
                              borderWidth: 1.5,
                              borderColor: c.bg,
                            }}
                          />
                          <View
                            style={{
                              position: "absolute",
                              top: 4,
                              paddingHorizontal: 7,
                              paddingVertical: 2,
                              borderRadius: 999,
                              backgroundColor: c.accent2,
                            }}
                          >
                            <Text style={{ color: c.bg, fontSize: 10, fontWeight: "800" }}>{t("timeline.today")}</Text>
                          </View>
                        </View>
                      ) : null}

                      {/* Event clusters */}
                      {clusters.map((cluster) => {
                        const lane = clusterLanes.get(cluster.key) ?? 0;
                        return (
                          <ClusterMarker
                            key={cluster.key}
                            cluster={cluster}
                            dupCount={cluster.events.length === 1 ? (deduped.duplicates.get(cluster.events[0].id) ?? 0) : 0}
                            axisY={axisY}
                            labelTop={axisY + LABEL_TOP_GAP + lane * EVENT_LANE_H}
                            showLabel={lane < labelLanes}
                            showTime={zoomLevel === "days" || zoomLevel === "hours"}
                            localeTag={localeTag}
                            color={c}
                            eventsLabel={eventsLabel}
                            onPressCluster={openCluster}
                            plotW={plotW}
                          />
                        );
                      })}
                    </>
                  ) : null}
                </Animated.View>
              </TapGestureHandler>
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </PinchGestureHandler>

      {/* Minimap scrubber */}
      <Minimap
        bounds={bounds}
        view={view}
        periods={periods}
        periodLanes={lanes}
        laneCount={laneCount}
        times={times}
        today={today}
        onSeek={(next) => {
          userMovedRef.current = true;
          setView(clampView(next.min, next.max));
        }}
        color={c}
      />

      {fullscreen ? null : (
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "center", marginTop: 6 }}>
          {t("timeline.gestureHint")}
        </Text>
      )}
    </View>
  );
}

function ControlBtn({
  icon,
  label,
  onPress,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label?: string;
  onPress: () => void;
  color: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderWidth: 1,
        borderColor: color.border,
        borderRadius: tokens.radiusSm,
        paddingHorizontal: label ? 10 : 8,
        paddingVertical: 6,
      }}
    >
      <Ionicons name={icon} size={15} color={color.muted} />
      {label ? <Text style={{ color: color.muted, fontSize: tokens.textXs, fontWeight: "600" }}>{label}</Text> : null}
    </Pressable>
  );
}

/**
 * One marker per cluster: a dot (or a count chip for a group) on the axis, a
 * hairline connector, and a label in its collision-free lane. Duplicate rows
 * show once with a ×N badge.
 *
 * Props are stable across re-renders (the press handler takes the cluster), so
 * memo holds while the board re-renders on every zoom frame. Markers mount
 * without an entrance animation: clusters regroup as the zoom changes, and a
 * pop-in on each regroup read as flicker.
 */
const ClusterMarker = React.memo(function ClusterMarker({
  cluster,
  dupCount,
  axisY,
  labelTop,
  showLabel,
  showTime,
  localeTag,
  color,
  eventsLabel,
  onPressCluster,
  plotW,
}: {
  plotW: number;
  cluster: TimelineCluster;
  dupCount: number;
  axisY: number;
  labelTop: number;
  showLabel: boolean;
  showTime: boolean;
  localeTag: string;
  color: ReturnType<typeof useColors>;
  eventsLabel: (n: number) => string;
  onPressCluster: (cluster: TimelineCluster) => void;
}) {
  const count = cluster.events.length;
  const multi = count > 1;
  const first = cluster.events[0];
  const isMilestone = !multi && first.category === MILESTONE_CATEGORY;
  const isManual = !multi && first.source !== "google_calendar";
  const onPress = () => onPressCluster(cluster);
  const x = cluster.x;

  const date = (ms: number, withYear: boolean) =>
    new Date(ms).toLocaleDateString(localeTag, {
      day: "numeric",
      month: "numeric",
      ...(withYear ? { year: "2-digit" as const } : {}),
    });
  const sub = multi
    ? `${date(cluster.timeMin, false)} – ${date(cluster.timeMax, true)}`
    : showTime && first.event_time
      ? `${first.event_time.slice(0, 5)} · ${date(eventDateTime(first), false)}`
      : date(eventDateTime(first), true);

  // Group chip grows with its digits; single events are dots, milestones ringed.
  const chipW = multi ? Math.max(20, 10 + String(count).length * 7) : 0;
  const dot = isMilestone ? 12 : 9;
  const fill = multi ? color.accent : isMilestone ? color.accent2 : isManual ? color.ink : color.accent;

  return (
    <>
      {showLabel ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: x - 0.5,
            top: axisY + 5,
            height: Math.max(labelTop - axisY - 6, 0),
            width: 1,
            backgroundColor: color.border,
          }}
        />
      ) : null}

      <Pressable
        onPress={onPress}
        hitSlop={12}
        style={{
          position: "absolute",
          left: x - (multi ? chipW / 2 : dot / 2),
          top: axisY - (multi ? 10 : dot / 2) + 0.75,
        }}
      >
        {multi ? (
          <View
            style={{
              width: chipW,
              height: 20,
              borderRadius: 10,
              backgroundColor: fill,
              borderWidth: 2,
              borderColor: color.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: color.bg, fontSize: 10, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
              {count}
            </Text>
          </View>
        ) : (
          <View
            style={{
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: fill,
              borderWidth: isMilestone ? 2.5 : 1.5,
              borderColor: isMilestone ? color.accent2 + "55" : color.bg,
            }}
          />
        )}
      </Pressable>

      {showLabel ? (
        <Pressable
          onPress={onPress}
          style={{
            position: "absolute",
            // Near an edge the label slides inward (its connector still marks
            // the exact date) instead of being cut off by the board.
            left: x >= 0 && x <= plotW ? Math.min(Math.max(x - 58, 2), plotW - 118) : x - 58,
            top: labelTop,
            width: 116,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 3 }}>
            <Text
              numberOfLines={1}
              style={{
                color: color.ink,
                fontSize: 11,
                fontWeight: isMilestone ? "800" : "600",
                textAlign: "center",
                flexShrink: 1,
              }}
            >
              {multi ? eventsLabel(count) : displayTitle(first)}
            </Text>
            {dupCount > 1 ? (
              <Text style={{ color: color.muted, fontSize: 9, fontWeight: "700" }}>×{dupCount}</Text>
            ) : null}
          </View>
          <Text style={{ color: color.muted, fontSize: 9.5, textAlign: "center", fontVariant: ["tabular-nums"] }}>
            {sub}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
});

const MINIMAP_BIN_PX = 3;

/**
 * The minimap's fixed layer: period strips, an event-density histogram and the
 * today tick. It depends only on the data and the track width, so it renders
 * once and not on every frame of a zoom or drag. (It used to draw one view per
 * event — 4,000 of them — and redraw them all on every frame.)
 */
const MinimapStatic = React.memo(function MinimapStatic({
  trackW,
  bounds,
  periods,
  periodLanes,
  laneCount,
  times,
  today,
  color,
}: {
  trackW: number;
  bounds: { min: number; max: number };
  periods: LifePeriod[];
  periodLanes: Map<string, number>;
  laneCount: number;
  times: readonly number[];
  today: string;
  color: ReturnType<typeof useColors>;
}) {
  const fullSpan = Math.max(bounds.max - bounds.min, 1);
  const laneRows = Math.min(laneCount, 4);
  const stripH = 3;
  const stripsTop = 5;
  const bins = useMemo(() => {
    const n = Math.max(Math.floor(trackW / MINIMAP_BIN_PX), 1);
    const counts = densityBins(times, bounds.min, bounds.max, n);
    let max = 0;
    for (const c of counts) if (c > max) max = c;
    return { counts, max };
  }, [times, bounds.min, bounds.max, trackW]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {periods.map((p) => {
        const lane = periodLanes.get(p.id);
        if (lane === undefined || lane >= laneRows) return null;
        const left = ((toTime(p.start_date) - bounds.min) / fullSpan) * trackW;
        const right = ((toTime(p.end_date || today) - bounds.min) / fullSpan) * trackW;
        return (
          <View
            key={p.id}
            style={{
              position: "absolute",
              left: Math.max(left, 0),
              width: Math.max(Math.min(right, trackW) - Math.max(left, 0), 2),
              top: stripsTop + lane * (stripH + 1),
              height: stripH,
              borderRadius: 2,
              backgroundColor: p.color + "AA",
            }}
          />
        );
      })}

      {bins.max > 0
        ? bins.counts.map((n, i) =>
            n === 0 ? null : (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: i * MINIMAP_BIN_PX,
                  width: MINIMAP_BIN_PX - 1,
                  bottom: 4,
                  height: 2 + Math.sqrt(n / bins.max) * 12,
                  backgroundColor: color.muted,
                  opacity: 0.35 + 0.5 * Math.sqrt(n / bins.max),
                }}
              />
            )
          )
        : null}

      <View
        style={{
          position: "absolute",
          left: ((toTime(today) - bounds.min) / fullSpan) * trackW,
          top: 2,
          bottom: 2,
          width: 1.5,
          backgroundColor: color.accent2,
        }}
      />
    </View>
  );
});

function Minimap({
  bounds,
  view,
  periods,
  periodLanes,
  laneCount,
  times,
  today,
  onSeek,
  color,
}: {
  bounds: { min: number; max: number };
  view: Win;
  periods: LifePeriod[];
  periodLanes: Map<string, number>;
  laneCount: number;
  times: readonly number[];
  today: string;
  onSeek: (v: Win) => void;
  color: ReturnType<typeof useColors>;
}) {
  const [trackW, setTrackW] = useState(0);
  const fullSpan = Math.max(bounds.max - bounds.min, 1);
  const viewRef = useRef(view);
  viewRef.current = view;
  const startRef = useRef<Win>(view);
  const trackWRef = useRef(trackW);
  trackWRef.current = trackW;

  const winLeft = ((view.min - bounds.min) / fullSpan) * trackW;
  const winWidth = Math.max(((view.max - view.min) / fullSpan) * trackW, 14);

  const onGestureEvent = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      const w = trackWRef.current || 1;
      const span = startRef.current.max - startRef.current.min;
      const dt = (e.nativeEvent.translationX / w) * fullSpan;
      onSeek({ min: startRef.current.min + dt, max: startRef.current.min + dt + span });
    },
    [fullSpan, onSeek]
  );

  const onStateChange = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.BEGAN) startRef.current = viewRef.current;
  }, []);

  const onTrackTap = useCallback(
    (e: TapGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state !== State.ACTIVE) return;
      const w = trackWRef.current || 1;
      const time = bounds.min + (e.nativeEvent.x / w) * fullSpan;
      const span = viewRef.current.max - viewRef.current.min;
      onSeek({ min: time - span / 2, max: time + span / 2 });
    },
    [bounds.min, fullSpan, onSeek]
  );

  return (
    <TapGestureHandler onHandlerStateChange={onTrackTap}>
      <View
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        style={{
          direction: "ltr",
          height: 40,
          marginTop: 8,
          borderRadius: tokens.radiusSm,
          backgroundColor: color.border + "40",
          overflow: "hidden",
          justifyContent: "center",
        }}
      >
        {trackW > 0 ? (
          <MinimapStatic
            trackW={trackW}
            bounds={bounds}
            periods={periods}
            periodLanes={periodLanes}
            laneCount={laneCount}
            times={times}
            today={today}
            color={color}
          />
        ) : null}

        <PanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onStateChange}>
          <View
            style={{
              position: "absolute",
              left: Math.min(Math.max(winLeft, 0), Math.max(trackW - winWidth, 0)),
              width: winWidth,
              top: 2,
              bottom: 2,
              borderRadius: 6,
              backgroundColor: color.accent + "26",
              borderWidth: 1.5,
              borderColor: color.accent,
            }}
          />
        </PanGestureHandler>
      </View>
    </TapGestureHandler>
  );
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  zoomChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
