import type { LifePeriod } from "@/lib/life-periods";
import type { TimelineEvent } from "@/lib/types";

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
  // pad ~3% on each side
  const pad = Math.max((max - min) * 0.03, 1000 * 60 * 60 * 24 * 30);
  return { min: min - pad, max: max + pad };
}

export function xFor(time: number, min: number, max: number, width: number) {
  if (max <= min) return 0;
  return ((time - min) / (max - min)) * width;
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
