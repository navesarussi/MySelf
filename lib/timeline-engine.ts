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
 * Events must be sorted by time (dedupeEvents guarantees this). A cluster is
 * closed as soon as the next marker is at least `minGapPx` away from the
 * cluster's last member, so cluster membership only depends on zoom — not on
 * pan position.
 */
export function clusterEvents(
  events: TimelineEvent[],
  viewMin: number,
  viewMax: number,
  plotW: number,
  minGapPx = 44
): TimelineCluster[] {
  if (!events.length || plotW <= 0 || viewMax <= viewMin) return [];
  const clusters: TimelineCluster[] = [];
  let current: { xs: number[]; events: TimelineEvent[]; timeMin: number; timeMax: number } | null =
    null;

  const flush = () => {
    if (!current) return;
    const first = current.xs[0];
    const last = current.xs[current.xs.length - 1];
    clusters.push({
      key: current.events[0].id,
      x: (first + last) / 2,
      timeMin: current.timeMin,
      timeMax: current.timeMax,
      events: current.events,
    });
    current = null;
  };

  for (const ev of events) {
    const time = eventDateTime(ev);
    const x = xFor(time, viewMin, viewMax, plotW);
    if (current && x - current.xs[current.xs.length - 1] < minGapPx) {
      current.xs.push(x);
      current.events.push(ev);
      current.timeMax = time;
    } else {
      flush();
      current = { xs: [x], events: [ev], timeMin: time, timeMax: time };
    }
  }
  flush();
  return clusters;
}

/** Target viewport for zooming into a cluster (tap-to-expand). */
export function clusterZoomTarget(cluster: TimelineCluster, minSpanMs = 6 * 60 * 60 * 1000) {
  const span = Math.max(cluster.timeMax - cluster.timeMin, 0);
  const pad = Math.max(span * 0.6, minSpanMs / 2);
  return { min: cluster.timeMin - pad, max: cluster.timeMax + pad };
}

/**
 * Stack clusters into label lanes so adjacent labels never overlap. Same greedy
 * packing as `assignEventLanes` but keyed by cluster and deterministic for
 * pre-sorted input.
 */
export function assignClusterLanes(clusters: TimelineCluster[], minGapPx = 96) {
  const laneLastX: number[] = [];
  const lanes = new Map<string, number>();
  for (const cl of clusters) {
    let lane = laneLastX.findIndex((lx) => cl.x - lx >= minGapPx);
    if (lane === -1) {
      lane = laneLastX.length;
      laneLastX.push(cl.x);
    } else {
      laneLastX[lane] = cl.x;
    }
    lanes.set(cl.key, lane);
  }
  return { lanes, laneCount: Math.max(laneLastX.length, 1) };
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
