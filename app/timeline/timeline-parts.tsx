"use client";

import { useMemo, useState } from "react";
import type { LifePeriod } from "@/lib/life-periods";
import { formatPeriodRange } from "@/lib/life-periods";
import {
  assignPeriodLanes,
  formatHeDate,
  todayIso,
  toTime,
  xFor,
} from "@/lib/timeline-layout";

const TRACK_H = 26;

export function PeriodTracks({
  periods,
  min,
  max,
  plotW,
}: {
  periods: LifePeriod[];
  min: number;
  max: number;
  plotW: number;
}) {
  const { lanes, laneCount } = useMemo(() => assignPeriodLanes(periods), [periods]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hovered = periods.find((p) => p.id === hoverId) || null;
  const tracksH = laneCount * (TRACK_H + 8) + 28;

  return (
    <div className="relative mb-2" style={{ height: tracksH }}>
      {periods.map((p) => {
        const lane = lanes.get(p.id) ?? 0;
        const x0 = xFor(toTime(p.start_date), min, max, plotW);
        const x1 = xFor(toTime(p.end_date || todayIso()), min, max, plotW);
        const w = Math.max(x1 - x0, 10);
        const narrow = w < 70;
        const top = 22 + lane * (TRACK_H + 8);

        return (
          <div key={p.id}>
            {narrow && (
              <div
                className="pointer-events-none absolute z-[1] max-w-[100px] truncate text-[10px] font-medium text-ink"
                style={{ left: x0, top: top - 16 }}
              >
                {p.title}
              </div>
            )}
            <button
              type="button"
              aria-label={p.title}
              onMouseEnter={() => setHoverId(p.id)}
              onMouseLeave={() => setHoverId(null)}
              onFocus={() => setHoverId(p.id)}
              onBlur={() => setHoverId(null)}
              className="absolute flex items-center overflow-hidden rounded-md px-2 text-start text-[11px] font-semibold text-bg shadow-sm outline-none ring-offset-2 transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent"
              style={{
                left: x0,
                width: w,
                top,
                height: TRACK_H,
                background: p.color,
                zIndex: hoverId === p.id ? 5 : 2,
              }}
            >
              {!narrow && <span className="truncate">{p.title}</span>}
            </button>
          </div>
        );
      })}

      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(
              xFor(toTime(hovered.start_date), min, max, plotW),
              plotW - 180
            ),
            top: 0,
          }}
        >
          <p className="font-semibold text-ink">{hovered.title}</p>
          <p className="mt-0.5 text-muted">{formatPeriodRange(hovered)}</p>
          {hovered.kind === "relationship" && (
            <p className="mt-0.5 text-accent">תקופת זוגיות</p>
          )}
        </div>
      )}
    </div>
  );
}

export function EventMarks({
  items,
  plotW,
}: {
  items: {
    id: string;
    x: number;
    lane: number;
    title: string;
    date: string;
    milestone: boolean;
  }[];
  plotW: number;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hovered = items.find((i) => i.id === hoverId) || null;
  const maxLane = items.reduce((m, i) => Math.max(m, i.lane), 0);
  const height = 28 + (maxLane + 1) * 56;

  return (
    <div className="relative mt-3" style={{ height }}>
      {items.map((ev) => (
        <button
          key={ev.id}
          type="button"
          onMouseEnter={() => setHoverId(ev.id)}
          onMouseLeave={() => setHoverId(null)}
          className="absolute flex w-[84px] -translate-x-1/2 flex-col items-center text-center outline-none"
          style={{ left: ev.x, top: 8 + ev.lane * 56, zIndex: hoverId === ev.id ? 6 : 1 }}
        >
          <span
            className={`h-3 w-3 rounded-full ${
              ev.milestone ? "bg-accent2 ring-4 ring-accent2/25" : "bg-accent"
            }`}
          />
          <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-tight text-ink">
            {ev.title}
          </span>
          <span className="text-[9px] text-muted">{formatHeDate(ev.date)}</span>
        </button>
      ))}

      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-30 max-w-[200px] rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(Math.max(hovered.x - 90, 0), plotW - 200),
            top: 8 + hovered.lane * 56 + 48,
          }}
        >
          <p className="font-semibold">{hovered.title}</p>
          <p className="text-muted">{formatHeDate(hovered.date)}</p>
        </div>
      )}
    </div>
  );
}
