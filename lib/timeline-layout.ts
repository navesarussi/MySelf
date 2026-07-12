import type { LifePeriod } from "@/lib/life-periods";
import type { TimelineEvent } from "@/lib/types";

export const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

export const MIN_PPY = 18;
export const MAX_PPY = 600_000;

export function pxPerDay(pxPerYear: number) {
  return pxPerYear / 365.25;
}

export function toTime(iso: string) {
  return new Date(iso).getTime();
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function timelineBounds(events: TimelineEvent[], periods: LifePeriod[]) {
  const today = todayIso();
  const dates = [
    ...events.map((e) => e.event_date),
    ...periods.map((p) => p.start_date),
    ...periods.map((p) => p.end_date || today),
    today,
  ];
  const times = dates.map(toTime);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const pad = Math.max((max - min) * 0.02, YEAR_MS / 6);
  return { min: min - pad, max: max + pad };
}

export function xFor(time: number, min: number, max: number, width: number) {
  if (max <= min) return 0;
  return ((time - min) / (max - min)) * width;
}

export function widthForRange(min: number, max: number, pxPerYear: number) {
  return Math.max(((max - min) / YEAR_MS) * pxPerYear, 320);
}

/** Greedy lane packing so overlapping periods don't stack on the same row. */
export function assignPeriodLanes(periods: LifePeriod[]) {
  const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();

  for (const p of sorted) {
    const start = toTime(p.start_date);
    const end = toTime(p.end_date || todayIso());
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    lanes.set(p.id, lane);
  }

  return { lanes, laneCount: Math.max(laneEnds.length, 1) };
}

/** Stack event labels vertically when their x positions are too close. */
export function assignEventLanes(items: { id: string; x: number }[], minGap = 88) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const laneLastX: number[] = [];
  const lanes = new Map<string, number>();

  for (const item of sorted) {
    let lane = laneLastX.findIndex((lx) => item.x - lx >= minGap);
    if (lane === -1) {
      lane = laneLastX.length;
      laneLastX.push(item.x);
    } else {
      laneLastX[lane] = item.x;
    }
    lanes.set(item.id, lane);
  }

  return { lanes, laneCount: Math.max(laneLastX.length, 1) };
}

export function formatHeDate(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL");
}

/** Adaptive axis ticks: years → months → days → hours based on zoom density. */
export type TimelineTick = { x: number; label: string; key: string; major?: boolean };

export function timelineTicks(min: number, max: number, plotW: number, pxPerYear: number): TimelineTick[] {
  const ppd = pxPerDay(pxPerYear);
  const pph = ppd / 24;

  if (pph >= 28) return hourTicks(min, max, plotW);
  if (ppd >= 18) return dayTicks(min, max, plotW);
  if (ppd >= 2.5) return monthTicks(min, max, plotW);
  return yearTicks(min, max, plotW).map((t) => ({
    x: t.x,
    label: String(t.year),
    key: `y-${t.year}`,
    major: true,
  }));
}

function hourTicks(min: number, max: number, plotW: number): TimelineTick[] {
  const ticks: TimelineTick[] = [];
  const start = new Date(min);
  start.setMinutes(0, 0, 0);
  const end = max + HOUR_MS;

  let step = 1;
  const ppd = plotW / ((max - min) / DAY_MS);
  const pph = ppd / 24;
  if (pph < 40) step = 2;
  if (pph < 22) step = 3;
  if (pph < 14) step = 6;
  if (pph < 8) step = 12;

  for (let t = start.getTime(); t <= end; t += step * HOUR_MS) {
    if (t < min - HOUR_MS || t > max + HOUR_MS) continue;
    const d = new Date(t);
    const major = d.getHours() === 0;
    const label = major
      ? d.toLocaleDateString("he-IL", { day: "numeric", month: "short" })
      : `${String(d.getHours()).padStart(2, "0")}:00`;
    ticks.push({ x: xFor(t, min, max, plotW), label, key: `h-${t}`, major });
  }
  return ticks;
}

function dayTicks(min: number, max: number, plotW: number): TimelineTick[] {
  const ticks: TimelineTick[] = [];
  const start = new Date(min);
  start.setHours(0, 0, 0, 0);
  const end = max + DAY_MS;
  const ppd = plotW / ((max - min) / DAY_MS);

  let step = 1;
  if (ppd < 40) step = 2;
  if (ppd < 22) step = 7;
  if (ppd < 12) step = 14;

  for (let t = start.getTime(); t <= end; t += step * DAY_MS) {
    if (t < min - DAY_MS || t > max + DAY_MS) continue;
    const d = new Date(t);
    const major = d.getDate() === 1;
    const label = d.toLocaleDateString("he-IL", {
      day: "numeric",
      month: major ? "short" : undefined,
      year: major ? "numeric" : undefined,
    });
    ticks.push({ x: xFor(t, min, max, plotW), label, key: `d-${t}`, major });
  }
  return ticks;
}

function monthTicks(min: number, max: number, plotW: number): TimelineTick[] {
  const ticks: TimelineTick[] = [];
  const minD = new Date(min);
  const maxD = new Date(max);
  const start = new Date(minD.getFullYear(), minD.getMonth(), 1);
  const ppd = plotW / ((max - min) / DAY_MS);

  let step = 1;
  if (ppd < 1.2) step = 3;
  if (ppd < 0.5) step = 6;

  for (let y = start.getFullYear(), m = start.getMonth(); ; ) {
    const t = new Date(y, m, 1).getTime();
    if (t > max + YEAR_MS) break;
    if (t >= min - DAY_MS) {
      ticks.push({
        x: xFor(t, min, max, plotW),
        label: new Date(y, m, 1).toLocaleDateString("he-IL", { month: "short", year: "numeric" }),
        key: `m-${y}-${m}`,
        major: m === 0,
      });
    }
    m += step;
    if (m > 11) {
      y += Math.floor(m / 12);
      m %= 12;
    }
    if (y > maxD.getFullYear() + 1) break;
  }
  return ticks;
}

/** Year tick marks along the axis; step adapts to zoom density. */
export function yearTicks(min: number, max: number, plotW: number) {
  const minYear = new Date(min).getFullYear();
  const maxYear = new Date(max).getFullYear();
  const span = Math.max(maxYear - minYear, 1);
  const pxPerYear = plotW / span;

  let step = 1;
  if (pxPerYear < 40) step = 2;
  if (pxPerYear < 22) step = 5;
  if (pxPerYear < 12) step = 10;
  if (pxPerYear < 6) step = 20;

  const ticks: { year: number; x: number }[] = [];
  const start = Math.floor(minYear / step) * step;
  for (let y = start; y <= maxYear + step; y += step) {
    const t = new Date(y, 0, 1).getTime();
    if (t < min - YEAR_MS || t > max + YEAR_MS) continue;
    ticks.push({ year: y, x: xFor(t, min, max, plotW) });
  }
  return ticks;
}
