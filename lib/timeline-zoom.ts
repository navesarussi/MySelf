import { DAY_MS, HOUR_MS, YEAR_MS } from "@/lib/timeline-layout";

export type TimelineZoomLevel = "years" | "months" | "days" | "hours";

export const TIMELINE_ZOOM_LEVELS: TimelineZoomLevel[] = ["years", "months", "days", "hours"];

export const DEFAULT_EVENT_MIN_ZOOM: TimelineZoomLevel = "months";

const ZOOM_RANK: Record<TimelineZoomLevel, number> = {
  years: 0,
  months: 1,
  days: 2,
  hours: 3,
};

/** Current zoom detail from viewport span — matches adaptive axis tick thresholds. */
export function spanToZoomLevel(spanMs: number): TimelineZoomLevel {
  const hours = spanMs / HOUR_MS;
  if (hours <= 30) return "hours";
  const days = spanMs / DAY_MS;
  if (days <= 45) return "days";
  const years = spanMs / YEAR_MS;
  if (years <= 3) return "months";
  return "years";
}

export function parseMinZoom(value: string | null | undefined): TimelineZoomLevel {
  if (value && value in ZOOM_RANK) return value as TimelineZoomLevel;
  return DEFAULT_EVENT_MIN_ZOOM;
}

/** Event is visible when the viewport is zoomed in at least to its min_zoom level. */
export function isEventVisibleAtZoom(
  minZoom: TimelineZoomLevel | null | undefined,
  spanMs: number
): boolean {
  const required = parseMinZoom(minZoom);
  return ZOOM_RANK[spanToZoomLevel(spanMs)] >= ZOOM_RANK[required];
}
