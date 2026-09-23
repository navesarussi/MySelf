/** Display formatting shared by the app screens (pure, no RN imports). */

export function fmtR(r: number | null | undefined, digits = 2): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return "—";
  const s = Math.abs(r).toFixed(digits);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${s}R`;
}

export function fmtUsd(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const s = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${x < 0 ? "−" : ""}$${s}`;
}

export function fmtSignedUsd(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${x > 0 ? "+" : ""}${fmtUsd(x)}`;
}

export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

/** Price with precision appropriate to magnitude (BTC 77,120 vs DOGE 0.1234). */
export function fmtPrice(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  // Tiny prices (PEPE ≈ 0.0000035) keep 4 significant digits instead of rounding to 0.000003.
  const digits = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 4 : a > 0 ? Math.min(12, Math.ceil(-Math.log10(a)) + 3) : 2;
  return x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtDateTime(iso: string | number | null | undefined, locale: "he" | "en" = "he"): string {
  if (iso === null || iso === undefined) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale === "he" ? "he-IL" : "en-US", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export type Tone = "good" | "warn" | "default" | "accent";

export function rTone(r: number | null | undefined): Tone {
  if (r === null || r === undefined) return "default";
  if (r > 0.05) return "good";
  if (r < -0.05) return "warn";
  return "default";
}

/** Holding time: minutes for a scalp, hours intraday, days for a swing. */
export function fmtDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours < 0) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
