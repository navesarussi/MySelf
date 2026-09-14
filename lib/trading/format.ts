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
  const digits = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
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
