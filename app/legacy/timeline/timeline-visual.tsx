"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize2, ChevronLeft, ChevronRight } from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import { displayTitle, isGoogleCalendarEvent } from "@/lib/timeline-display";
import type { LifePeriod } from "@/lib/life-periods";
import { useTranslations } from "@/components/locale-provider";
import {
  assignEventLanes,
  assignVisiblePeriodLanes,
  axisLineTop,
  eventDateTime,
  plotBandHeight,
  timelineBounds,
  TRACKS_PAD_TOP,
  tracksHeight,
  xFor,
} from "@/lib/timeline-layout";
import { isEventVisibleAtZoom } from "@/lib/timeline-zoom";
import {
  createViewport,
  fitViewport,
  panViewport,
  sliderToSpan,
  spanToSlider,
  viewSpan,
  zoomLevelLabel,
  zoomViewport,
  type TimelineViewport,
} from "@/lib/timeline-viewport";
import {
  AXIS_TICK_RESERVED,
  EventMarks,
  PeriodConnectors,
  PeriodTracks,
  TimelineAxis,
} from "./timeline-parts";
import { PeriodEditForm } from "./period-edit-form";
import { EventEditForm } from "./event-edit-form";

const PLOT_PAD = 48;

export function TimelineVisual({
  events,
  periods,
}: {
  events: TimelineEvent[];
  periods: LifePeriod[];
}) {
  const { t } = useTranslations();
  const global = useMemo(() => timelineBounds(events, periods), [events, periods]);
  const [viewport, setViewport] = useState<TimelineViewport>(() =>
    createViewport(global.min, global.max)
  );
  const [editingPeriod, setEditingPeriod] = useState<LifePeriod | null>(null);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [plotW, setPlotW] = useState(720);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViewport((v) => createViewport(global.min, global.max));
  }, [global.min, global.max]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setPlotW(Math.max(entry.contentRect.width - PLOT_PAD, 280));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { viewMin, viewMax } = viewport;
  const span = viewSpan(viewport);
  const globalSpan = global.max - global.min;
  const { lanes, laneCount } = useMemo(
    () => assignVisiblePeriodLanes(periods, viewMin, viewMax),
    [periods, viewMin, viewMax]
  );
  const tracksH = tracksHeight(laneCount);

  const eventItems = useMemo(() => {
    const visible = events.filter((ev) => {
      if (!isEventVisibleAtZoom(ev.min_zoom, span)) return false;
      const time = eventDateTime(ev);
      return time >= viewMin - span * 0.02 && time <= viewMax + span * 0.02;
    });
    const placed = visible
      .sort((a, b) => eventDateTime(a) - eventDateTime(b))
      .map((ev) => ({
        id: ev.id,
        x: xFor(eventDateTime(ev), viewMin, viewMax, plotW),
        title: displayTitle(ev),
        date: ev.event_date,
        milestone: ev.category === "אבן דרך",
        fromGoogle: isGoogleCalendarEvent(ev),
      }));
    const minGap = span <= 3 * 24 * 60 * 60 * 1000 ? 36 : 72;
    const { lanes: evLanes } = assignEventLanes(placed, minGap);
    return placed.map((p) => ({ ...p, lane: evLanes.get(p.id) ?? 0 }));
  }, [events, viewMin, viewMax, plotW, span]);

  const setZoomAt = useCallback((factor: number, anchor = 0.5) => {
    setViewport((v) => zoomViewport(v, factor, anchor));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const anchor = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;
        setZoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, anchor);
        return;
      }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const deltaMs = (e.deltaX / plotW) * span;
        setViewport((v) => panViewport(v, deltaMs));
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [plotW, span, setZoomAt]);

  const sliderVal = spanToSlider(span, globalSpan);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs text-muted">{t("timeline.dragHint")}</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewport((v) => fitViewport(v))}
            className="rounded-lg border px-2 py-1.5 text-muted hover:text-ink"
            title={t("timeline.fitAll")}
          >
            <Maximize2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => setViewport((v) => panViewport(v, -span * 0.25))}
            className="rounded-lg border p-1.5 text-muted hover:text-ink"
            title={t("timeline.panLeft")}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setZoomAt(1 / 1.35)}
            className="rounded-lg border p-1.5 text-muted hover:text-ink"
            title={t("timeline.zoomOut")}
          >
            <Minus size={16} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={sliderVal}
            onChange={(e) => {
              const nextSpan = sliderToSpan(Number(e.target.value), globalSpan);
              const center = (viewport.viewMin + viewport.viewMax) / 2;
              setViewport((v) =>
                zoomViewport(
                  { ...v, viewMin: center - nextSpan / 2, viewMax: center + nextSpan / 2 },
                  1,
                  0.5
                )
              );
            }}
            className="w-28 accent-[var(--accent)]"
            aria-label={t("timeline.zoomLevel")}
          />
          <button
            type="button"
            onClick={() => setZoomAt(1.35)}
            className="rounded-lg border p-1.5 text-muted hover:text-ink"
            title={t("timeline.zoomIn")}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => setViewport((v) => panViewport(v, span * 0.25))}
            className="rounded-lg border p-1.5 text-muted hover:text-ink"
            title={t("timeline.panRight")}
          >
            <ChevronRight size={16} />
          </button>
          <span className="w-12 text-center text-[10px] text-muted">{zoomLevelLabel(span)}</span>
        </div>
      </div>

      <div ref={containerRef} className="overflow-hidden p-6 pb-12" dir="ltr">
        <div className="relative" style={{ width: plotW + PLOT_PAD }}>
          <div
            className="relative"
            style={{ height: plotBandHeight(tracksH), paddingTop: TRACKS_PAD_TOP }}
          >
            <PeriodTracks
              periods={periods}
              min={viewMin}
              max={viewMax}
              plotW={plotW}
              lanes={lanes}
              editingId={editingPeriod?.id ?? null}
              onEdit={setEditingPeriod}
            />
            <PeriodConnectors
              periods={periods}
              lanes={lanes}
              min={viewMin}
              max={viewMax}
              plotW={plotW}
              tracksH={tracksH}
            />
            <div className="absolute inset-x-0" style={{ top: axisLineTop(tracksH) }}>
              <TimelineAxis
                periods={periods}
                min={viewMin}
                max={viewMax}
                plotW={plotW}
                showPeriodMarks={span > globalSpan * 0.15}
              />
            </div>
          </div>

          <EventMarks
            items={eventItems}
            plotW={plotW}
            onSelect={(id) => setEditingEvent(events.find((e) => e.id === id) ?? null)}
            editingId={editingEvent?.id ?? null}
          />
        </div>
      </div>

      {editingPeriod && (
        <PeriodEditForm period={editingPeriod} onClose={() => setEditingPeriod(null)} />
      )}
      {editingEvent && (
        <EventEditForm event={editingEvent} onClose={() => setEditingEvent(null)} />
      )}
    </div>
  );
}
