/** Parse HH:MM or HH:MM:SS into HH:MM for storage/display. */
export function parseTxnTime(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${m[1]}:${m[2]}`;
}

export function formatTxnDateTime(txn_date: string, txn_time: string | null): string {
  if (!txn_time) return txn_date;
  return `${txn_date} ${txn_time}`;
}
