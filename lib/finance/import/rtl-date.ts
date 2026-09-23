/** Reverse RTL-mirrored date tokens from Cal/Leumi PDF text (e.g. 6202/10/61 → 2026-01-16). */
export function unreverseRtlDateToken(token: string): string | null {
  const m = token.match(/^(\d{4})\/(\d{2})\/(\d{2,3})$/);
  if (!m) return null;
  const rev = (s: string) => s.split("").reverse().join("");
  const year = rev(m[1]);
  let month = rev(m[2]);
  let day = rev(m[3]);
  // Cal PDFs sometimes append installment digit to the day segment (e.g. 1072 → day 27).
  if (day.length === 3) day = day.slice(0, 2);
  if (month.length === 3) month = month.slice(0, 2);
  const mi = Number(month);
  const di = Number(day);
  if (!/^\d{4}$/.test(year) || mi < 1 || mi > 12 || di < 1 || di > 31) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Parse DD/MM/YY or DD/MM/YYYY from Leumi annual statements. */
export function parseHebrewStatementDate(raw: string): string | null {
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return null;
  const day = m[1];
  const month = m[2];
  let year = m[3];
  if (year.length === 2) year = `20${year}`;
  const mi = Number(month);
  const di = Number(day);
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
