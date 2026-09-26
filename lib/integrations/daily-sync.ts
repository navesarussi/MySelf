/**
 * Whether a daily cron sync can skip because this provider already synced
 * "today".
 *
 * This used to be a rolling 24 hours, but the cron fires once a day. Any sync
 * after the cron's hour (a manual one from the app, say) was then under 24
 * hours old at the next day's run, so that run skipped, and the provider
 * synced every other day. On 2026-09-26 the 06:00 calendar run skipped over
 * a manual sync from 11:51 the day before. A sync counts as today's only if it
 * happened on the same UTC date, which is the app's day convention (todayISO).
 */
export function syncedToday(lastSyncAt: string | null | undefined, now = new Date()): boolean {
  if (!lastSyncAt) return false;
  const last = new Date(lastSyncAt);
  if (Number.isNaN(last.getTime())) return false;
  return last.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}
