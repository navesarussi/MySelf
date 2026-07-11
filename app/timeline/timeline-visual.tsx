"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import type { LifePeriod } from "@/lib/life-periods";
import {
  assignEventLanes,
  timelineBounds,
  toTime,
  widthForRange,
  xFor,
} from "@/lib/timeline-layout";
import {
  assignPeriodLanes,
  EventMarks,
  PeriodConnectors,
  PeriodTracks,
  TimelineAxis,
  tracksHeight,
} from "./timeline-parts";
import { PeriodEditForm } from "./period-edit-form";

const MIN_PPY = 18;
const MAX_PPY = 900;
const DEFAULT_PPY = 120;
const CONNECTOR_H = 28;

export function TimelineVisual({
  events,
  periods,
}: {
  events: TimelineEvent[];
  periods: LifePeriod[];
}) {
  const [pxPerYear, setPxPerYear] = useState(DEFAULT_PPY);
  const [editing, setEditing] = useState<LifePeriod | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { min, max } = useMemo(() => timelineBounds(events, periods), [events, periods]);
  const width = widthForRange(min, max, pxPerYear);
  const plotW = width - 48;
  const { lanes, laneCount } = useMemo(() => assignPeriodLanes(periods), [periods]);
  const tracksH = tracksHeight(laneCount);

  const eventItems = useMemo(() => {
    const placed = [...events]
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
      .map((ev) => ({
        id: ev.id,
        x: xFor(toTime(ev.event_date), min, max, plotW),
        title: ev.title,
        date: ev.event_date,
        milestone: ev.category === "אבן דרך",
      }));
    const { lanes: evLanes } = assignEventLanes(placed, 90);
    return placed.map((p) => ({ ...p, lane: evLanes.get(p.id) ?? 0 }));
  }, [events, min, max, plotW]);

  const setZoomPreservingCenter = useCallback((next: number) => {
    const el = scroller.current;
    const clamped = Math.min(MAX_PPY, Math.max(MIN_PPY, next));
    if (!el) {
      setPxPerYear(clamped);
      return;
    }
    const oldWidth = widthForRange(min, max, pxPerYear);
    const centerRatio = (el.scrollLeft + el.clientWidth / 2) / Math.max(oldWidth, 1);
    setPxPerYear(clamped);
    requestAnimationFrame(() => {
      const newWidth = widthForRange(min, max, clamped);
      el.scrollLeft = centerRatio * newWidth - el.clientWidth / 2;
    });
  }, [min, max, pxPerYear]);

  function zoomBy(factor: number) {
    setZoomPreservingCenter(pxPerYear * factor);
  }

  function fitAll() {
    const el = scroller.current;
    const target = el ? Math.max(MIN_PPY, (el.clientWidth - 64) / ((max - min) / (365.25 * 86400000))) : MIN_PPY;
    setPxPerYear(Math.min(MAX_PPY, target));
    requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollLeft = 0;
    });
  }

  function onWheel(e: React.WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  const pct = Math.round(((pxPerYear - MIN_PPY) / (MAX_PPY - MIN_PPY)) * 100);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs text-muted">
          גלול לצדדים · Ctrl/⌘ + גלגלת לזום · לחץ על תקופה לעריכה
        </p>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={fitAll} className="rounded-lg border px-2 py-1.5 text-muted hover:text-ink" title="התאם הכל">
            <Maximize2 size={15} />
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.35)} className="rounded-lg border p-1.5 text-muted hover:text-ink" title="הקטן">
            <Minus size={16} />
          </button>
          <input
            type="range"
            min={MIN_PPY}
            max={MAX_PPY}
            step={2}
            value={pxPerYear}
            onChange={(e) => setZoomPreservingCenter(Number(e.target.value))}
            className="w-28 accent-[var(--accent)]"
            aria-label="רמת זום"
          />
          <button type="button" onClick={() => zoomBy(1.35)} className="rounded-lg border p-1.5 text-muted hover:text-ink" title="הגדל">
            <Plus size={16} />
          </button>
          <span className="w-10 text-center text-[10px] text-muted">{pct}%</span>
        </div>
      </div>

      <div ref={scroller} onWheel={onWheel} className="overflow-x-auto scrollbar-thin" dir="ltr">
        <div className="relative p-6 pb-12" style={{ width }}>
          <div className="relative" style={{ height: tracksH + CONNECTOR_H + 40, paddingTop: 20 }}>
            <PeriodTracks
              periods={periods}
              min={min}
              max={max}
              plotW={plotW}
              lanes={lanes}
              editingId={editing?.id ?? null}
              onEdit={setEditing}
            />
            <PeriodConnectors
              periods={periods}
              lanes={lanes}
              min={min}
              max={max}
              plotW={plotW}
              tracksH={tracksH}
              connectorH={CONNECTOR_H}
            />
            <div className="absolute inset-x-0" style={{ top: tracksH + CONNECTOR_H }}>
              <TimelineAxis periods={periods} min={min} max={max} plotW={plotW} />
            </div>
          </div>

          <EventMarks items={eventItems} plotW={plotW} />
        </div>
      </div>

      {editing && (
        <PeriodEditForm period={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
