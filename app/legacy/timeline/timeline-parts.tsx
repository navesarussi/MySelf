"use client";

import { useMemo, useState } from "react";
import type { LifePeriod } from "@/lib/life-periods";
import { formatPeriodRange } from "@/lib/life-periods";
import { formatLocaleDate } from "@/lib/i18n/core";
import { useTranslations } from "@/components/locale-provider";
import {
  periodIntersectsView,
  toTime,
  todayIso,
  xFor,
  timelineTicks,
  TRACKS_PAD_TOP,
  TRACK_H,
  AXIS_TICK_RESERVED,
  axisLineTop,
  periodBarGeom,
  tracksHeight,
} from "@/lib/timeline-layout";

type LaneMap = Map<string, number>;

export {
  TRACK_H,
  TRACKS_PAD_TOP,
  CONNECTOR_H,
  AXIS_TICK_RESERVED,
  periodBarGeom,
  tracksHeight,
  axisLineTop,
  plotBandHeight,
  lowestBarBottom,
} from "@/lib/timeline-layout";

export function PeriodTracks({
  periods,
  min,
  max,
  plotW,
  lanes,
  editingId,
  onEdit,
}: {
  periods: LifePeriod[];
  min: number;
  max: number;
  plotW: number;
  lanes: LaneMap;
  editingId: string | null;
  onEdit: (period: LifePeriod) => void;
}) {
  const { t, locale } = useTranslations();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hovered = periods.find((p) => p.id === hoverId) || null;
  const laneCount = Math.max(...[...lanes.values(), 0]) + 1;
  const h = tracksHeight(laneCount);

  return (
    <div className="relative" style={{ height: h }}>
      {periods.map((p) => {
        if (!periodIntersectsView(p, min, max)) return null;
        const lane = lanes.get(p.id);
        if (lane === undefined) return null;
        const { top } = periodBarGeom(lane);
        const x0 = xFor(toTime(p.start_date), min, max, plotW);
        const x1 = xFor(toTime(p.end_date || todayIso()), min, max, plotW);
        const w = Math.max(x1 - x0, 10);
        const narrow = w < 70;
        const selected = editingId === p.id;

        return (
          <div key={p.id}>
            {narrow && (
              <div
                className="pointer-events-none absolute z-[1] max-w-[100px] truncate text-[10px] font-medium text-ink"
                style={{ left: x0, top: top - 14 }}
              >
                {p.title}
              </div>
            )}
            <button
              type="button"
              aria-label={t("timeline.editPeriodAria", { title: p.title })}
              onMouseEnter={() => setHoverId(p.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onEdit(p)}
              className={`absolute flex items-center overflow-hidden rounded-md px-2 text-start text-[11px] font-semibold text-bg shadow-sm outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent ${
                selected ? "ring-2 ring-accent" : ""
              }`}
              style={{
                left: x0,
                width: w,
                top,
                height: TRACK_H,
                background: p.color,
                zIndex: hoverId === p.id || selected ? 5 : 2,
              }}
            >
              {!narrow && <span className="truncate">{p.title}</span>}
            </button>
          </div>
        );
      })}

      {hovered && editingId !== hovered.id && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(xFor(toTime(hovered.start_date), min, max, plotW), plotW - 200),
            top: 0,
          }}
        >
          <p className="font-semibold text-ink">{hovered.title}</p>
          <p className="mt-0.5 text-muted">{formatPeriodRange(hovered, locale)}</p>
          <p className="mt-1 text-[10px] text-muted">{t("timeline.clickToEdit")}</p>
        </div>
      )}
    </div>
  );
}

export function PeriodConnectors({
  periods,
  lanes,
  min,
  max,
  plotW,
  tracksH,
}: {
  periods: LifePeriod[];
  lanes: LaneMap;
  min: number;
  max: number;
  plotW: number;
  tracksH: number;
  connectorH?: number;
}) {
  const axisLineY = axisLineTop(tracksH);

  return (
    <svg
      className="pointer-events-none absolute left-0 overflow-visible"
      width={plotW}
      height={axisLineY}
      style={{ top: 0 }}
    >
      {periods.map((p) => {
        if (!periodIntersectsView(p, min, max)) return null;
        const lane = lanes.get(p.id);
        if (lane === undefined) return null;
        const { bottom } = periodBarGeom(lane);
        const barBottomY = TRACKS_PAD_TOP + bottom;
        const x0 = xFor(toTime(p.start_date), min, max, plotW);
        const x1 = xFor(toTime(p.end_date || todayIso()), min, max, plotW);

        return (
          <g key={p.id} opacity={0.4}>
            <line x1={x0} y1={barBottomY} x2={x0} y2={axisLineY} stroke={p.color} strokeWidth={1} strokeDasharray="4 3" />
            <line x1={x1} y1={barBottomY} x2={x1} y2={axisLineY} stroke={p.color} strokeWidth={1} strokeDasharray="4 3" />
          </g>
        );
      })}
    </svg>
  );
}

type AxisMark = { x: number; date: string; key: string };

function collectAxisMarks(
  periods: LifePeriod[],
  min: number,
  max: number,
  plotW: number,
  locale: import("@/lib/i18n").Locale,
  todayLabel: string
): AxisMark[] {
  const raw: AxisMark[] = [];
  for (const p of periods) {
    if (!periodIntersectsView(p, min, max)) continue;
    raw.push({
      x: xFor(toTime(p.start_date), min, max, plotW),
      date: formatLocaleDate(locale, p.start_date),
      key: `${p.id}-s`,
    });
    raw.push({
      x: xFor(toTime(p.end_date || todayIso()), min, max, plotW),
      date: p.end_date ? formatLocaleDate(locale, p.end_date) : todayLabel,
      key: `${p.id}-e`,
    });
  }
  const seen = new Set<string>();
  return raw.filter((m) => {
    const k = `${Math.round(m.x)}-${m.date}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function TimelineAxis({
  periods,
  min,
  max,
  plotW,
  showPeriodMarks = true,
}: {
  periods: LifePeriod[];
  min: number;
  max: number;
  plotW: number;
  showPeriodMarks?: boolean;
}) {
  const { t, locale } = useTranslations();
  const ticks = useMemo(() => timelineTicks(min, max, plotW), [min, max, plotW]);
  const marks = useMemo(
    () => collectAxisMarks(periods, min, max, plotW, locale, t("common.today")),
    [periods, min, max, plotW, locale, t]
  );
  const todayX = xFor(Date.now(), min, max, plotW);

  return (
    <div className="relative z-10 pb-6">
      <div
        className="pointer-events-none absolute bottom-full left-0 right-0 mb-1"
        style={{ height: AXIS_TICK_RESERVED }}
      >
        {ticks.map((tick) => (
          <div
            key={tick.key}
            className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: tick.x }}
          >
            <span className={`text-[10px] font-medium ${tick.major ? "text-ink" : "text-muted"}`}>
              {tick.label}
            </span>
            <span className={`mt-0.5 w-px bg-border ${tick.major ? "h-2.5" : "h-1.5"}`} />
          </div>
        ))}
      </div>

      <div className="relative h-1 rounded-full bg-border">
        {ticks.map((tick) => (
          <span
            key={`g-${tick.key}`}
            className={`absolute bottom-0 top-0 w-px ${tick.major ? "bg-border" : "bg-border/50"}`}
            style={{ left: tick.x }}
          />
        ))}
        {showPeriodMarks &&
          marks.map((m) => (
            <span key={`t-${m.key}`} className="absolute bottom-0 top-0 w-px bg-accent/50" style={{ left: m.x }} />
          ))}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-accent ring-4 ring-accent/20"
          style={{ left: todayX }}
          title={t("common.today")}
        />
      </div>

      {showPeriodMarks &&
        marks.map((m) => (
          <div
            key={m.key}
            className="absolute top-full mt-1 flex -translate-x-1/2 flex-col items-center"
            style={{ left: m.x }}
          >
            <span className="h-1.5 w-px bg-accent/60" />
            <span className="mt-0.5 whitespace-nowrap rounded bg-surface px-1.5 py-0.5 text-[9px] text-ink shadow-sm ring-1 ring-border/50">
              {m.date}
            </span>
          </div>
        ))}
    </div>
  );
}

export function EventMarks({
  items,
  plotW,
  onSelect,
  editingId,
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
  onSelect?: (id: string) => void;
  editingId?: string | null;
}) {
  const { t, locale } = useTranslations();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hovered = items.find((i) => i.id === hoverId) || null;
  const maxLane = items.reduce((m, i) => Math.max(m, i.lane), 0);
  const contentHeight = 28 + (maxLane + 1) * 56;
  const maxStripHeight = 280;

  return (
    <div
      className="relative mt-4 overflow-y-auto"
      style={{ maxHeight: maxStripHeight, height: Math.min(contentHeight, maxStripHeight) }}
    >
      <div className="relative" style={{ height: contentHeight, minHeight: "100%" }}>
      {items.map((ev) => (
        <button
          key={ev.id}
          type="button"
          onClick={() => onSelect?.(ev.id)}
          onMouseEnter={() => setHoverId(ev.id)}
          onMouseLeave={() => setHoverId(null)}
          className={`absolute flex w-[84px] -translate-x-1/2 flex-col items-center text-center outline-none ${
            editingId === ev.id ? "ring-2 ring-accent rounded-lg" : ""
          }`}
          style={{ left: ev.x, top: 8 + ev.lane * 56, zIndex: hoverId === ev.id || editingId === ev.id ? 6 : 1 }}
        >
          <span
            className={`h-3 w-3 rounded-full ${
              ev.milestone ? "bg-accent2 ring-4 ring-accent2/25" : "bg-accent"
            }`}
          />
          <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-tight text-ink">
            {ev.title}
          </span>
          <span className="text-[9px] text-muted">{formatLocaleDate(locale, ev.date)}</span>
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
          <p className="text-muted">{formatLocaleDate(locale, hovered.date)}</p>
          <p className="mt-1 text-[10px] text-muted">{t("timeline.clickToEdit")}</p>
        </div>
      )}
      </div>
    </div>
  );
}
