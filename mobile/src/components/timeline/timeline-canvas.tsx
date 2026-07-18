import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
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
  stablePeriodLanes,
  visibleLabelSegment,
  type TimelineCluster,
} from "@/lib/timeline-engine";
import { isEventVisibleAtZoom, spanToZoomLevel, type TimelineZoomLevel } from "@/lib/timeline-zoom";
import { displayTitle } from "@/lib/timeline-display";
import type { LifePeriod } from "@/lib/life-periods";
import type { TimelineEvent } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const EVENT_LANE_H = 30;
const CLUSTER_GAP_PX = 48;
const LABEL_GAP_PX = 120;
const MIN_SPAN_MS = 3 * HOUR_MS;
const MILESTONE_CATEGORY = "אבן דרך";

type Win = { min: number; max: number };

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
  const bounds = useMemo(() => timelineBounds(deduped.events, periods), [deduped.events, periods]);
  const [view, setView] = useState<Win>(() => ({ min: bounds.min, max: bounds.max }));
  const [plotW, setPlotW] = useState(0);

  // Re-fit when the underlying data range changes.
  useEffect(() => {
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
    haptic("light");
  }, [animateViewTo, bounds.min, bounds.max]);

  const goToToday = useCallback(() => {
    const { min, max } = viewRef.current;
    const span = max - min;
    const center = toTime(today) + 12 * HOUR_MS;
    animateViewTo(clampView(center - span / 2, center + span / 2));
    haptic("light");
  }, [animateViewTo, clampView, today]);

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
  const span = view.max - view.min;
  const padMin = view.min - span;
  const padMax = view.max + span;

  const { lanes, laneCount } = useMemo(() => stablePeriodLanes(periods, today), [periods, today]);
  const tracksH = tracksHeight(laneCount);
  const intrinsicAxisY = axisLineTop(tracksH);

  const zoomVisibleEvents = useMemo(
    () => deduped.events.filter((ev) => isEventVisibleAtZoom(ev.min_zoom, span)),
    [deduped.events, span]
  );

  const clusters = useMemo(() => {
    if (!plotW) return [];
    return clusterEvents(zoomVisibleEvents, view.min, view.max, plotW, CLUSTER_GAP_PX).filter(
      (cl) => cl.x >= -plotW && cl.x <= plotW * 2
    );
  }, [zoomVisibleEvents, view.min, view.max, plotW]);

  const { lanes: clusterLanes, laneCount: clusterLaneCount } = useMemo(
    () => assignClusterLanes(clusters, LABEL_GAP_PX),
    [clusters]
  );

  const intrinsicH = plotBandHeight(tracksH) + clusterLaneCount * EVENT_LANE_H + 16;
  const topPad = Math.max((height - intrinsicH) / 2, 8);
  const axisY = topPad + intrinsicAxisY;

  // Ticks generated over a 3-span overscan window so edges stay populated mid-drag.
  const ticks = useMemo(() => {
    if (!plotW) return [];
    return timelineTicks(padMin, padMax, plotW * 3, localeTag).map((tk) => ({ ...tk, x: tk.x - plotW }));
  }, [padMin, padMax, plotW, localeTag]);

  const todayX = plotW ? xFor(toTime(today) + 12 * HOUR_MS, view.min, view.max, plotW) : -1;
  const zoomLevel = spanToZoomLevel(span);
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
                              backgroundColor: c.border + "66",
                            }}
                          />
                        ))}

                      {/* Period bands (stable lanes, clamped geometry, sticky labels) */}
                      {periods.map((p) => {
                        const lane = lanes.get(p.id);
                        if (lane === undefined) return null;
                        const startX = xFor(toTime(p.start_date), view.min, view.max, plotW);
                        const endX = xFor(toTime(p.end_date || today), view.min, view.max, plotW);
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
                              top: topPad + geom.top,
                              height: geom.bottom - geom.top,
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
                                  style={{ color: c.ink, fontSize: 11, fontWeight: "700", maxWidth: label.width }}
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
                          height: 2,
                          backgroundColor: c.border,
                        }}
                      />

                      {/* Today glow line */}
                      {todayX >= -plotW && todayX <= plotW * 2 ? (
                        <View
                          pointerEvents="none"
                          style={{ position: "absolute", left: todayX - 8, top: 0, bottom: 0, width: 16, alignItems: "center" }}
                        >
                          <LinearGradient
                            colors={[c.accent2 + "00", c.accent2 + "44", c.accent2 + "00"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
                          />
                          <View style={{ width: 2, flex: 1, backgroundColor: c.accent2 }} />
                          <View style={{ position: "absolute", top: axisY - 5, width: 10, height: 10, borderRadius: 999, backgroundColor: c.accent2 }} />
                          <View
                            style={{
                              position: "absolute",
                              top: 4,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 999,
                              backgroundColor: c.accent2 + "26",
                              borderWidth: 1,
                              borderColor: c.accent2 + "66",
                            }}
                          >
                            <Text style={{ color: c.accent2, fontSize: 9, fontWeight: "700" }}>
                              {t("timeline.today")}
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      {/* Ticks */}
                      {ticks.map((tick) => (
                        <View
                          key={tick.key}
                          pointerEvents="none"
                          style={{ position: "absolute", left: tick.x - 40, width: 80, top: axisY - 26, alignItems: "center" }}
                        >
                          <Text
                            numberOfLines={1}
                            style={{
                              color: tick.major ? c.ink : c.muted,
                              fontSize: tick.major ? 10 : 9,
                              fontWeight: tick.major ? "700" : "400",
                            }}
                          >
                            {tick.label}
                          </Text>
                          <View style={{ width: 1, height: tick.major ? 12 : 6, backgroundColor: c.border, marginTop: 2 }} />
                        </View>
                      ))}

                      {/* Event clusters */}
                      {clusters.map((cluster) => (
                        <ClusterMarker
                          key={cluster.key}
                          cluster={cluster}
                          duplicates={deduped.duplicates}
                          axisY={axisY}
                          labelTop={axisY + 16 + (clusterLanes.get(cluster.key) ?? 0) * EVENT_LANE_H}
                          localeTag={localeTag}
                          color={c}
                          eventsLabel={(n) => t("timeline.eventsCount", { count: n })}
                          onPress={() => openCluster(cluster)}
                        />
                      ))}
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
        events={deduped.events}
        today={today}
        onSeek={(next) => setView(clampView(next.min, next.max))}
        color={c}
      />

      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "center", marginTop: 6 }}>
        {t("timeline.gestureHint")}
      </Text>
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
 * One marker per cluster: a dot (or count chip for multi-event clusters) on the
 * axis, a hairline connector, and a single label block in its collision-free
 * lane. Duplicate rows show once with a ×N badge.
 */
function ClusterMarker({
  cluster,
  duplicates,
  axisY,
  labelTop,
  localeTag,
  color,
  eventsLabel,
  onPress,
}: {
  cluster: TimelineCluster;
  duplicates: Map<string, number>;
  axisY: number;
  labelTop: number;
  localeTag: string;
  color: ReturnType<typeof useColors>;
  eventsLabel: (n: number) => string;
  onPress: () => void;
}) {
  const appear = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const multi = cluster.events.length > 1;
  const first = cluster.events[0];
  const isMilestone = !multi && first.category === MILESTONE_CATEGORY;
  const isGoogle = !multi && first.source === "google_calendar";
  const dotColor = multi ? color.accent : isMilestone || isGoogle ? color.accent2 : color.accent;
  const dupCount = multi ? 0 : (duplicates.get(first.id) ?? 0);

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();
  }, [appear]);

  useEffect(() => {
    if (!isMilestone) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isMilestone, pulse]);

  const dotSize = multi ? 20 : isMilestone ? 14 : 10;
  const x = cluster.x;

  const dateLabel = multi
    ? `${new Date(cluster.timeMin).toLocaleDateString(localeTag, { month: "numeric", day: "numeric" })} – ${new Date(cluster.timeMax).toLocaleDateString(localeTag, { year: "2-digit", month: "numeric", day: "numeric" })}`
    : new Date(eventDateTime(first)).toLocaleDateString(localeTag, {
        year: "2-digit",
        month: "numeric",
        day: "numeric",
      });

  return (
    <>
      {/* Connector from axis to label lane */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: x - StyleSheet.hairlineWidth,
          top: axisY + 6,
          height: Math.max(labelTop - axisY - 7, 0),
          width: StyleSheet.hairlineWidth * 2,
          backgroundColor: color.border,
        }}
      />

      <Animated.View
        style={{
          position: "absolute",
          left: x - dotSize / 2,
          top: axisY - dotSize / 2 + 1,
          opacity: appear,
          transform: [{ scale: appear }],
        }}
      >
        {isMilestone ? (
          <Animated.View
            style={{
              position: "absolute",
              left: -6,
              top: -6,
              width: dotSize + 12,
              height: dotSize + 12,
              borderRadius: 999,
              backgroundColor: color.accent2,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.8] }) }],
            }}
          />
        ) : null}
        <Pressable onPress={onPress} hitSlop={12}>
          <View
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: 999,
              backgroundColor: multi ? color.accent : dotColor,
              borderWidth: 2,
              borderColor: color.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {multi ? (
              <Text style={{ color: color.bg, fontSize: 10, fontWeight: "800" }}>{cluster.events.length}</Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>

      <Animated.View style={{ position: "absolute", left: x - 56, top: labelTop, width: 112, opacity: appear }}>
        <Pressable onPress={onPress}>
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 3 }}>
            <Text
              numberOfLines={1}
              style={{ color: color.ink, fontSize: 10.5, fontWeight: "600", textAlign: "center", flexShrink: 1 }}
            >
              {multi ? eventsLabel(cluster.events.length) : displayTitle(first)}
            </Text>
            {dupCount > 1 ? (
              <Text style={{ color: color.muted, fontSize: 9, fontWeight: "700" }}>×{dupCount}</Text>
            ) : null}
          </View>
          <Text style={{ color: color.muted, fontSize: 9, textAlign: "center" }}>{dateLabel}</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

function Minimap({
  bounds,
  view,
  periods,
  periodLanes,
  laneCount,
  events,
  today,
  onSeek,
  color,
}: {
  bounds: { min: number; max: number };
  view: Win;
  periods: LifePeriod[];
  periodLanes: Map<string, number>;
  laneCount: number;
  events: TimelineEvent[];
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

  const laneRows = Math.min(laneCount, 4);
  const stripH = 3;
  const stripsTop = 5;

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
          height: 40,
          marginTop: 8,
          borderRadius: tokens.radiusSm,
          backgroundColor: color.border + "40",
          overflow: "hidden",
          justifyContent: "center",
        }}
      >
        {/* Period strips (same stable lanes as the board, compressed) */}
        {trackW > 0
          ? periods.map((p) => {
              const lane = periodLanes.get(p.id);
              if (lane === undefined || lane >= laneRows) return null;
              const left = ((toTime(p.start_date) - bounds.min) / fullSpan) * trackW;
              const right = ((toTime(p.end_date || today) - bounds.min) / fullSpan) * trackW;
              return (
                <View
                  key={p.id}
                  pointerEvents="none"
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
            })
          : null}

        {/* Event density dots */}
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 26, height: 3 }}>
          {trackW > 0
            ? events.map((ev) => (
                <View
                  key={ev.id}
                  style={{
                    position: "absolute",
                    left: ((eventDateTime(ev) - bounds.min) / fullSpan) * trackW - 1,
                    width: 2,
                    height: 3,
                    borderRadius: 1,
                    backgroundColor: color.muted,
                  }}
                />
              ))
            : null}
        </View>

        {/* Today tick */}
        {trackW > 0 ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: ((toTime(today) - bounds.min) / fullSpan) * trackW,
              top: 2,
              bottom: 2,
              width: 1.5,
              backgroundColor: color.accent2,
            }}
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
              backgroundColor: color.accent + "33",
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
