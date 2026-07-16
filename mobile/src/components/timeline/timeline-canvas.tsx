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
import { isEventVisibleAtZoom, spanToZoomLevel, type TimelineZoomLevel } from "@/lib/timeline-zoom";
import { displayTitle } from "@/lib/timeline-display";
import type { LifePeriod } from "@/lib/life-periods";
import type { TimelineEvent } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const EVENT_LANE_H = 22;
const MILESTONE_CATEGORY = "אבן דרך";

type Win = { min: number; max: number };

function haptic(kind: "select" | "light") {
  if (Platform.OS === "web") return;
  if (kind === "select") Haptics.selectionAsync().catch(() => {});
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/**
 * Cinematic, gesture-driven timeline board. Runs on the old RN architecture, so
 * live panning uses a native-driver translate (buttery, no distortion) and zoom
 * uses focal-anchored state updates; programmatic moves (double-tap, buttons,
 * minimap) ease via requestAnimationFrame. All plotting reuses the shared
 * lib/timeline-* math so web and native stay in sync.
 */
export function TimelineCanvas({
  events,
  periods,
  height,
  fullscreen = false,
  onEventPress,
  onPeriodPress,
}: {
  events: TimelineEvent[];
  periods: LifePeriod[];
  height: number;
  fullscreen?: boolean;
  onEventPress?: (ev: TimelineEvent) => void;
  onPeriodPress?: (p: LifePeriod) => void;
}) {
  const c = useColors();
  const { t, locale } = useI18n();

  const bounds = useMemo(() => timelineBounds(events, periods), [events, periods]);
  const [view, setView] = useState<Win>(() => ({ min: bounds.min, max: bounds.max }));
  const [plotW, setPlotW] = useState(0);

  // Re-fit when the underlying data range changes (mirrors the web behaviour).
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
      const nextSpan = Math.min(Math.max(max - min, 3 * HOUR_MS), Math.max(fullSpan, 6 * HOUR_MS));
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

  // --- Layout ---
  const span = view.max - view.min;
  const padMin = view.min - span;
  const padMax = view.max + span;
  const today = todayIso();

  const { lanes, laneCount } = useMemo(
    () => assignVisiblePeriodLanes(periods, padMin, padMax),
    [periods, padMin, padMax]
  );
  const tracksH = tracksHeight(laneCount);
  const intrinsicAxisY = axisLineTop(tracksH);

  const visibleEvents = useMemo(
    () =>
      events.filter((ev) => {
        const time = eventDateTime(ev);
        return time >= padMin && time <= padMax && isEventVisibleAtZoom(ev.min_zoom, span);
      }),
    [events, padMin, padMax, span]
  );

  const eventItems = useMemo(
    () =>
      visibleEvents.map((ev) => ({ ev, x: xFor(eventDateTime(ev), view.min, view.max, plotW || 1) })),
    [visibleEvents, view.min, view.max, plotW]
  );
  const { lanes: eventLanes, laneCount: eventLaneCount } = useMemo(
    () => assignEventLanes(eventItems.map((i) => ({ id: i.ev.id, x: i.x })), 104),
    [eventItems]
  );

  const intrinsicH = plotBandHeight(tracksH) + eventLaneCount * EVENT_LANE_H + 16;
  const topPad = Math.max((height - intrinsicH) / 2, 8);
  const axisY = topPad + intrinsicAxisY;

  // Ticks generated over a 3-span overscan window so edges stay populated mid-drag.
  const ticks = useMemo(() => {
    if (!plotW) return [];
    return timelineTicks(padMin, padMax, plotW * 3).map((tk) => ({ ...tk, x: tk.x - plotW }));
  }, [padMin, padMax, plotW]);

  const todayX = plotW ? xFor(toTime(today), view.min, view.max, plotW) : -1;
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
                      {/* Period bands */}
                      {periods.map((p) => {
                        const lane = lanes.get(p.id);
                        if (lane === undefined) return null;
                        const start = xFor(toTime(p.start_date), view.min, view.max, plotW);
                        const end = xFor(toTime(p.end_date || today), view.min, view.max, plotW);
                        const left = Math.min(start, end);
                        const width = Math.max(Math.max(start, end) - left, 8);
                        const geom = periodBarGeom(lane);
                        return (
                          <Pressable
                            key={p.id}
                            onPress={() => onPeriodPress?.(p)}
                            style={{
                              position: "absolute",
                              left,
                              width,
                              top: topPad + geom.top,
                              height: geom.bottom - geom.top,
                              borderRadius: 9,
                              borderWidth: 1,
                              borderColor: p.color,
                              overflow: "hidden",
                              justifyContent: "center",
                              paddingHorizontal: 8,
                            }}
                          >
                            <LinearGradient
                              colors={[p.color + "66", p.color + "22"]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 1 }}
                              style={StyleSheet.absoluteFill}
                            />
                            <Text numberOfLines={1} style={{ color: c.ink, fontSize: 11, fontWeight: "700" }}>
                              {p.title}
                            </Text>
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
                        <View style={{ position: "absolute", left: todayX - 8, top: 0, bottom: 0, width: 16, alignItems: "center" }}>
                          <LinearGradient
                            colors={[c.accent2 + "00", c.accent2 + "44", c.accent2 + "00"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
                          />
                          <View style={{ width: 2, flex: 1, backgroundColor: c.accent2 }} />
                          <View style={{ position: "absolute", top: axisY - 5, width: 10, height: 10, borderRadius: 999, backgroundColor: c.accent2 }} />
                        </View>
                      ) : null}

                      {/* Ticks */}
                      {ticks.map((tick) => (
                        <View
                          key={tick.key}
                          style={{ position: "absolute", left: tick.x - 32, width: 64, top: axisY - 24, alignItems: "center" }}
                        >
                          <Text
                            numberOfLines={1}
                            style={{ color: tick.major ? c.ink : c.muted, fontSize: 9, fontWeight: tick.major ? "700" : "400" }}
                          >
                            {tick.label}
                          </Text>
                          <View style={{ width: 1, height: tick.major ? 12 : 6, backgroundColor: c.border, marginTop: 2 }} />
                        </View>
                      ))}

                      {/* Events */}
                      {eventItems.map(({ ev, x }) => (
                        <EventMarker
                          key={ev.id}
                          ev={ev}
                          x={x}
                          dotTop={axisY - 5}
                          labelTop={axisY + 14 + (eventLanes.get(ev.id) ?? 0) * EVENT_LANE_H}
                          locale={locale}
                          color={c}
                          onPress={() => onEventPress?.(ev)}
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
      <Minimap bounds={bounds} view={view} onSeek={(next) => setView(clampView(next.min, next.max))} color={c} />

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

function EventMarker({
  ev,
  x,
  dotTop,
  labelTop,
  locale,
  color,
  onPress,
}: {
  ev: TimelineEvent;
  x: number;
  dotTop: number;
  labelTop: number;
  locale: "he" | "en";
  color: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const appear = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const isMilestone = ev.category === MILESTONE_CATEGORY;
  const isGoogle = ev.source === "google_calendar";
  const dotColor = isMilestone ? color.accent2 : isGoogle ? color.accent2 : color.accent;

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

  const dotSize = isMilestone ? 14 : 10;

  return (
    <>
      <Animated.View
        style={{
          position: "absolute",
          left: x - dotSize / 2,
          top: dotTop - (dotSize - 10) / 2,
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
        <Pressable onPress={onPress} hitSlop={10}>
          <View
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: 999,
              backgroundColor: dotColor,
              borderWidth: 2,
              borderColor: color.bg,
            }}
          />
        </Pressable>
      </Animated.View>
      <Animated.View
        style={{ position: "absolute", left: x - 52, top: labelTop, width: 104, opacity: appear }}
      >
        <Pressable onPress={onPress}>
          <Text numberOfLines={1} style={{ color: color.ink, fontSize: 10, fontWeight: "600", textAlign: "center" }}>
            {displayTitle(ev)}
          </Text>
          <Text style={{ color: color.muted, fontSize: 8, textAlign: "center" }}>
            {new Date(ev.event_date).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
              year: "2-digit",
              month: "numeric",
              day: "numeric",
            })}
          </Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

function Minimap({
  bounds,
  view,
  onSeek,
  color,
}: {
  bounds: { min: number; max: number };
  view: Win;
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

  return (
    <View
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      style={{
        height: 34,
        marginTop: 8,
        borderRadius: tokens.radiusSm,
        backgroundColor: color.border + "40",
        overflow: "hidden",
        justifyContent: "center",
      }}
    >
      <View style={{ position: "absolute", left: 0, right: 0, top: 16, height: 1, backgroundColor: color.border }} />
      <PanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onStateChange}>
        <View
          style={{
            position: "absolute",
            left: Math.min(Math.max(winLeft, 0), Math.max(trackW - winWidth, 0)),
            width: winWidth,
            top: 3,
            bottom: 3,
            borderRadius: 6,
            backgroundColor: color.accent + "33",
            borderWidth: 1.5,
            borderColor: color.accent,
          }}
        />
      </PanGestureHandler>
    </View>
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
