import type { LifePeriod } from "@/lib/life-periods";
import type { TimelineEvent } from "@/lib/types";

export const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

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
