import { DAY_MS, HOUR_MS, YEAR_MS } from "@/lib/timeline-layout";

export const MIN_VIEW_SPAN_MS = 4 * HOUR_MS;

export type TimelineViewport = {
  globalMin: number;
  globalMax: number;
  viewMin: number;
  viewMax: number;
};

export function createViewport(globalMin: number, globalMax: number): TimelineViewport {
  const span = Math.max(globalMax - globalMin, DAY_MS);
  return { globalMin, globalMax, viewMin: globalMin, viewMax: globalMax };
}

export function viewSpan(vp: TimelineViewport) {
  return vp.viewMax - vp.viewMin;
}

export function clampViewport(vp: TimelineViewport): TimelineViewport {
  const span = Math.max(MIN_VIEW_SPAN_MS, Math.min(viewSpan(vp), vp.globalMax - vp.globalMin));
  let center = (vp.viewMin + vp.viewMax) / 2;
  const half = span / 2;
  const minCenter = vp.globalMin + half;
  const maxCenter = vp.globalMax - half;
  center = Math.min(Math.max(center, minCenter), maxCenter);
  return {
    ...vp,
    viewMin: center - half,
    viewMax: center + half,
  };
}

/** Zoom around anchor ratio 0..1 within the current view. factor > 1 = zoom in. */
export function zoomViewport(vp: TimelineViewport, factor: number, anchor = 0.5): TimelineViewport {
  const span = viewSpan(vp);
  const nextSpan = span / factor;
  const anchorTime = vp.viewMin + span * anchor;
  const next = {
    ...vp,
    viewMin: anchorTime - nextSpan * anchor,
    viewMax: anchorTime + nextSpan * (1 - anchor),
  };
  return clampViewport(next);
}

export function panViewport(vp: TimelineViewport, deltaMs: number): TimelineViewport {
  return clampViewport({
    ...vp,
    viewMin: vp.viewMin + deltaMs,
    viewMax: vp.viewMax + deltaMs,
  });
}

export function fitViewport(vp: TimelineViewport): TimelineViewport {
  return { ...vp, viewMin: vp.globalMin, viewMax: vp.globalMax };
}

export function zoomLevelLabel(spanMs: number): string {
  const hours = spanMs / HOUR_MS;
  if (hours <= 30) return "שעות";
  const days = spanMs / DAY_MS;
  if (days <= 45) return "ימים";
  const years = spanMs / YEAR_MS;
  if (years <= 3) return "חודשים";
  return "שנים";
}

/** 0 = full zoom out, 100 = max zoom in */
export function spanToSlider(spanMs: number, globalSpan: number): number {
  const min = MIN_VIEW_SPAN_MS;
  const max = Math.max(globalSpan, min * 2);
  const clamped = Math.max(min, Math.min(spanMs, max));
  return (1 - (Math.log(clamped / min) / Math.log(max / min))) * 100;
}

export function sliderToSpan(slider: number, globalSpan: number): number {
  const min = MIN_VIEW_SPAN_MS;
  const max = Math.max(globalSpan, min * 2);
  const t = slider / 100;
  return min * Math.pow(max / min, 1 - t);
}
