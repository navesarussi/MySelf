import type { LifePeriod } from "@/lib/life-periods";
import type { TimelineEvent } from "@/lib/types";
import { displayTitle } from "@/lib/timeline-display";
import { eventDateTime, toTime, todayIso, xFor } from "@/lib/timeline-layout";

/**
 * Pure layout engine for the visual timeline.
 *
 * Everything here is deterministic and viewport-math only, so the exact same
 * inputs always produce the exact same board — no lane reshuffling while the
 * user pans or zooms. The mobile canvas (and any future renderer) consumes
 * these primitives; rendering code should contain no layout decisions of its
 * own.
 */

// ---------------------------------------------------------------------------
// Stable period lanes
// ---------------------------------------------------------------------------

/**
 * Viewport-independent lane packing for period bars.
 *
 * Unlike `assignVisiblePeriodLanes`, the result never changes while panning or
 * zooming: lanes are computed once over the full dataset with a deterministic
 * order (start asc, longer bar first, id as tiebreaker). Lane 0 renders at the
 * top (the row that was packed last, i.e. the newest overlap), matching the
 * existing visual convention.
 */
export function stablePeriodLanes(periods: LifePeriod[], today = todayIso()) {
  const sorted = [...periods].sort((a, b) => {
    if (a.start_date !== b.start_date) return a.start_date.localeCompare(b.start_date);
    const aEnd = a.end_date || today;
    const bEnd = b.end_date || today;
    if (aEnd !== bEnd) return bEnd.localeCompare(aEnd); // longer first
    return a.id.localeCompare(b.id);
  });

  const laneEnds: number[] = [];
  const packed = new Map<string, number>();
  for (const p of sorted) {
    const start = toTime(p.start_date);
    const end = toTime(p.end_date || today);
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    packed.set(p.id, lane);
  }

  const laneCount = Math.max(laneEnds.length, 1);
  const lanes = new Map<string, number>();
  for (const [id, lane] of packed) lanes.set(id, laneCount - 1 - lane);
  return { lanes, laneCount };
}

// ---------------------------------------------------------------------------
// Duplicate collapsing
// ---------------------------------------------------------------------------

export type DedupedEvents = {
  events: TimelineEvent[];
  /** kept event id → total number of identical rows it represents (>= 2 only). */
  duplicates: Map<string, number>;
};

function dedupeKey(ev: TimelineEvent) {
  return `${displayTitle(ev)}|${ev.event_date}|${ev.event_time ?? ""}`;
}

/**
 * Collapse rows that are identical from the user's point of view (same title,
 * date and time) into a single representative event. The earliest-created row
 * wins so the representative id stays stable across refreshes.
 */
export function dedupeEvents(events: TimelineEvent[]): DedupedEvents {
  const byKey = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const key = dedupeKey(ev);
    const list = byKey.get(key);
    if (list) list.push(ev);
    else byKey.set(key, [ev]);
  }

  const kept: TimelineEvent[] = [];
  const duplicates = new Map<string, number>();
  for (const group of byKey.values()) {
    const winner = [...group].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
    )[0];
    kept.push(winner);
    if (group.length > 1) duplicates.set(winner.id, group.length);
  }
  kept.sort((a, b) => eventDateTime(a) - eventDateTime(b) || a.id.localeCompare(b.id));
  return { events: kept, duplicates };
}

// ---------------------------------------------------------------------------
// Event clustering
// ---------------------------------------------------------------------------

export type TimelineCluster = {
  key: string;
  /** representative x in plot px (midpoint of member positions). */
  x: number;
  timeMin: number;
  timeMax: number;
  events: TimelineEvent[];
};

/**
 * Group events whose markers would collide at the current zoom into clusters.
 *
 * Events fall into fixed buckets of absolute time, `minGapPx` wide at this
 * zoom, so a cluster never covers more than one bucket and its membership does
 * not depend on where the view starts (panning never regroups). The bucket
 * width is rounded up to a half power of two, so small zoom changes during a
 * pinch keep the same grouping instead of reshuffling every frame. Two
 * neighbouring clusters that still land closer than `minGapPx` merge once
 * (pairwise, so merging cannot chain).
 *
 * This replaced "join while the next marker is within the gap", which chained:
 * a steady run of events became one cluster spanning more than a year, drawn at
 * its midpoint — far from most of its members.
 *
 * The marker sits at the members' mean time. Events must be sorted by time
 * (dedupeEvents guarantees it).
 */
export function clusterEvents(
  events: TimelineEvent[],
  viewMin: number,
  viewMax: number,
  plotW: number,
  minGapPx = 44
): TimelineCluster[] {
  if (!events.length || plotW <= 0 || viewMax <= viewMin) return [];
  const msPerPx = (viewMax - viewMin) / plotW;
  const bucketMs = Math.pow(2, Math.ceil(Math.log2(minGapPx * msPerPx) * 2) / 2);

  type Acc = { bucket: number; events: TimelineEvent[]; sum: number; timeMin: number; timeMax: number };
  const buckets: Acc[] = [];
  for (const ev of events) {
    const time = eventDateTime(ev);
    const bucket = Math.floor(time / bucketMs);
    const last = buckets[buckets.length - 1];
    if (last && last.bucket === bucket) {
      last.events.push(ev);
      last.sum += time;
      last.timeMax = time;
    } else {
      buckets.push({ bucket, events: [ev], sum: time, timeMin: time, timeMax: time });
    }
  }

  const toCluster = (acc: Acc): TimelineCluster => ({
    key: acc.events[0].id,
    x: xFor(acc.sum / acc.events.length, viewMin, viewMax, plotW),
    timeMin: acc.timeMin,
    timeMax: acc.timeMax,
    events: acc.events,
  });

  const clusters: TimelineCluster[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const cur = toCluster(buckets[i]);
    const next = buckets[i + 1] ? toCluster(buckets[i + 1]) : null;
    if (next && next.x - cur.x < minGapPx) {
      const events2 = [...cur.events, ...next.events];
      const sum = buckets[i].sum + buckets[i + 1].sum;
      clusters.push({
        key: cur.key,
        x: xFor(sum / events2.length, viewMin, viewMax, plotW),
        timeMin: cur.timeMin,
        timeMax: next.timeMax,
        events: events2,
      });
      i++;
    } else {
      clusters.push(cur);
    }
  }
  return clusters;
}

/** Target viewport for zooming into a cluster (tap-to-expand). */
export function clusterZoomTarget(cluster: TimelineCluster, minSpanMs = 6 * 60 * 60 * 1000) {
  const span = Math.max(cluster.timeMax - cluster.timeMin, 0);
  const pad = Math.max(span * 0.6, minSpanMs / 2);
  return { min: cluster.timeMin - pad, max: cluster.timeMax + pad };
}

/**
 * Stack clusters into label lanes so adjacent labels never overlap. Clusters
 * for which `isPriority` is true are placed first, so when only a few lanes fit
 * under the axis they are the ones that keep their labels. Within each pass
 * clusters go in x order; deterministic for pre-sorted input.
 */
export function assignClusterLanes(
  clusters: TimelineCluster[],
  minGapPx = 96,
  isPriority?: (cluster: TimelineCluster) => boolean
) {
  const laneXs: number[][] = [];
  const lanes = new Map<string, number>();
  const place = (cl: TimelineCluster) => {
    let lane = laneXs.findIndex((xs) => xs.every((x) => Math.abs(cl.x - x) >= minGapPx));
    if (lane === -1) {
      lane = laneXs.length;
      laneXs.push([]);
    }
    laneXs[lane].push(cl.x);
    lanes.set(cl.key, lane);
  };
  if (isPriority) {
    for (const cl of clusters) if (isPriority(cl)) place(cl);
    for (const cl of clusters) if (!isPriority(cl)) place(cl);
  } else {
    for (const cl of clusters) place(cl);
  }
  return { lanes, laneCount: Math.max(laneXs.length, 1) };
}

// ---------------------------------------------------------------------------
// Geometry clamping (deep-zoom safety + sticky labels)
// ---------------------------------------------------------------------------

export type ClampedSpan = {
  left: number;
  width: number;
  /** true when the real start/end extends beyond the clamped edge. */
  clippedStart: boolean;
  clippedEnd: boolean;
};

/**
 * Clamp a bar's pixel span to a sane window around the viewport. At deep zoom
 * a multi-year period maps to millions of pixels; native views at those
 * coordinates lose float precision and can fail to render. Clamping to
 * ±overhang keeps geometry exact inside the visible window.
 */
export function clampSpanX(
  startX: number,
  endX: number,
  plotW: number,
  overhang = plotW
): ClampedSpan | null {
  const rawLeft = Math.min(startX, endX);
  const rawRight = Math.max(startX, endX);
  if (rawRight < -overhang || rawLeft > plotW + overhang) return null;
  const left = Math.max(rawLeft, -overhang);
  const right = Math.min(rawRight, plotW + overhang);
  return {
    left,
    width: Math.max(right - left, 8),
    clippedStart: left > rawLeft,
    clippedEnd: right < rawRight,
  };
}

/**
 * The on-screen part of a bar where its label may sit ("sticky" label). Returns
 * null when the visible slice is too narrow to hold any text.
 */
export function visibleLabelSegment(
  barLeft: number,
  barRight: number,
  plotW: number,
  pad = 8,
  minWidth = 30
) {
  const left = Math.max(barLeft + pad, pad);
  const right = Math.min(barRight - pad, plotW - pad);
  if (right - left < minWidth) return null;
  return { left, width: right - left };
}

// ---------------------------------------------------------------------------
// Time index (sorted event times) — window slicing and density
// ---------------------------------------------------------------------------

/** First index whose time is >= `t` in an ascending array (binary search). */
export function lowerBound(sortedTimes: readonly number[], t: number): number {
  let lo = 0;
  let hi = sortedTimes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedTimes[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index range [start, end) of the times inside [min, max). */
export function timeWindow(sortedTimes: readonly number[], min: number, max: number) {
  return { start: lowerBound(sortedTimes, min), end: lowerBound(sortedTimes, max) };
}

/**
 * How many events fall in each of `bins` equal slices of [min, max). Cost is
 * the events in the window plus one binary search, so it can run on every
 * zoom frame over thousands of events.
 */
export function densityBins(sortedTimes: readonly number[], min: number, max: number, bins: number): number[] {
  const counts = new Array<number>(Math.max(bins, 0)).fill(0);
  if (bins <= 0 || max <= min) return counts;
  const { start, end } = timeWindow(sortedTimes, min, max);
  const scale = bins / (max - min);
  for (let i = start; i < end; i++) {
    counts[Math.min(Math.floor((sortedTimes[i] - min) * scale), bins - 1)]++;
  }
  return counts;
}
