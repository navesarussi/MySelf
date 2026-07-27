/** Jerusalem calendar day YYYY-MM-DD and hour 0–23 for quiet hours / dedup. */

export function jerusalemParts(now = new Date()): { dayKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hourRaw = Number(get("hour"));
  // en-CA may emit "24" for midnight in some runtimes
  const hour = hourRaw === 24 ? 0 : hourRaw;

  return {
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
  };
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
