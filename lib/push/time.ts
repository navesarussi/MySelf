import { parseISO } from "date-fns";

/** App-wide wall clock for habits, push dedup, and quiet hours. */
export const APP_TIMEZONE = "Asia/Jerusalem";

/** Jerusalem calendar day YYYY-MM-DD and hour 0–23 for quiet hours / dedup. */
export function jerusalemParts(now = new Date()): { dayKey: string; hour: number } {
  const { dayKey, hour } = jerusalemClock(now);
  return { dayKey, hour };
}

/** Jerusalem calendar day, hour, and minutes-since-midnight for habit windows. */
export function jerusalemClock(now = new Date()): {
  dayKey: string;
  hour: number;
  minute: number;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(get("minute"));

  return {
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

/** UTC instant when the Jerusalem calendar day `dayKey` begins (00:00 local). */
export function findJerusalemDayStart(dayKey: string): Date {
  const anchor = parseISO(`${dayKey}T12:00:00.000Z`);
  for (let deltaHours = -18; deltaHours <= 18; deltaHours += 1) {
    const candidate = new Date(anchor.getTime() + deltaHours * 3_600_000);
    const clock = jerusalemClock(candidate);
    if (clock.dayKey === dayKey && clock.minutes === 0) {
      return candidate;
    }
  }
  throw new Error(`Jerusalem day start not found for ${dayKey}`);
}

/** UTC instant for wall-clock HH:MM on a Jerusalem calendar day. */
export function jerusalemWallClockToDate(dayKey: string, time = "00:00"): Date {
  const [h = 0, m = 0] = time.slice(0, 5).split(":").map(Number);
  const start = findJerusalemDayStart(dayKey);
  return new Date(start.getTime() + ((h || 0) * 60 + (m || 0)) * 60_000);
}

export function previousJerusalemDay(dayKey: string): string {
  const start = findJerusalemDayStart(dayKey);
  return jerusalemClock(new Date(start.getTime() - 60_000)).dayKey;
}

export function nextJerusalemDay(dayKey: string): string {
  const start = findJerusalemDayStart(dayKey);
  return jerusalemClock(new Date(start.getTime() + 24 * 3_600_000 + 60_000)).dayKey;
}

/** Quiet window wraps midnight when start > end (e.g. 22–7). */
export function isQuietHour(
  hour: number,
  quietStart: number,
  quietEnd: number
): boolean {
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) {
    return hour >= quietStart && hour < quietEnd;
  }
  return hour >= quietStart || hour < quietEnd;
}
