"use client";

import { useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import type { LifePeriod } from "@/lib/life-periods";
import { assignPeriodLanes, timelineBounds, toTime, todayIso, xFor } from "@/lib/timeline-layout";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;
const BASE_WIDTH = 1100;

export function TimelineVisual({
  events,
  periods,
}: {
  events: TimelineEvent[];
  periods: LifePeriod[];
}) {
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const { min, max } = useMemo(() => timelineBounds(events, periods), [events, periods]);
  const { lanes, laneCount } = useMemo(() => assignPeriodLanes(periods), [periods]);
  const width = BASE_WIDTH * zoom;
  const trackH = 22;
  const tracksH = laneCount * (trackH + 6) + 8;
  const sortedAsc = useMemo(
    () => [...events].sort((a, b) => a.event_date.localeCompare(b.event_date)),
    [events]
  );

  function zoomBy(factor: number) {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((z * factor).toFixed(2)))));
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs text-muted">ציר ויזואלי — תקופות למעלה, אירועים על הציר. גלול לצדדים.</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => zoomBy(1 / 1.25)} className="rounded-lg border p-1.5 text-muted hover:text-ink" title="הקטן">
            <Minus size={16} />
          </button>
          <span className="w-12 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => zoomBy(1.25)} className="rounded-lg border p-1.5 text-muted hover:text-ink" title="הגדל">
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div ref={scroller} className="overflow-x-auto scrollbar-thin" dir="ltr">
        <div className="relative p-4" style={{ width, minWidth: "100%" }}>
          {/* Period bands */}
          <div className="relative mb-3" style={{ height: tracksH }}>
            {periods.map((p) => {
              const lane = lanes.get(p.id) ?? 0;
              const x0 = xFor(toTime(p.start_date), min, max, width - 32);
              const x1 = xFor(toTime(p.end_date || todayIso()), min, max, width - 32);
              const w = Math.max(x1 - x0, 8);
              return (
                <div
                  key={p.id}
                  title={`${p.title}`}
                  className="absolute flex items-center overflow-hidden rounded-md px-2 text-[10px] font-medium text-bg"
                  style={{
                    left: x0,
                    width: w,
                    top: lane * (trackH + 6),
                    height: trackH,
                    background: p.color,
                    opacity: 0.9,
                  }}
                >
                  <span className="truncate">{p.title}</span>
                </div>
              );
            })}
          </div>

          {/* Axis */}
          <div className="relative h-2 rounded-full bg-border">
            <div className="absolute inset-y-0 end-0 w-2 rounded-full bg-accent" title="היום" />
          </div>

          {/* Event markers */}
          <div className="relative mt-2" style={{ height: 120 }}>
            {sortedAsc.map((ev, i) => {
              const x = xFor(toTime(ev.event_date), min, max, width - 32);
              const milestone = ev.category === "אבן דרך";
              const stagger = (i % 2) * 52;
              return (
                <div key={ev.id} className="absolute flex flex-col items-center" style={{ left: x, top: stagger, transform: "translateX(-50%)" }}>
                  <span className={`h-2.5 w-2.5 rounded-full ${milestone ? "bg-accent2 ring-2 ring-accent2/30" : "bg-accent"}`} />
                  <span className="mt-1 max-w-[72px] text-center text-[10px] leading-tight text-ink">
                    {ev.title}
                  </span>
                  <span className="text-[9px] text-muted">
                    {new Date(ev.event_date).toLocaleDateString("he-IL")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
