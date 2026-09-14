import {
  CODING_TASK_COOLDOWN_MINUTES,
  CODING_TASK_DAILY_LIMIT,
  CODING_TASK_IN_FLIGHT_MAX_AGE_MS,
  type CodingAgentJob,
  type QuotaBlockReason,
  type QuotaSnapshot,
} from "@/lib/agent/coding/types";

export function jerusalemCalendarDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function launchedToday(jobs: CodingAgentJob[], day: string): CodingAgentJob[] {
  return jobs.filter((job) => {
    if (!job.cursor_agent_id) return false;
    return jerusalemCalendarDate(new Date(job.created_at)) === day;
  });
}

function activeInFlight(jobs: CodingAgentJob[], now: Date): CodingAgentJob | null {
  const cutoff = now.getTime() - CODING_TASK_IN_FLIGHT_MAX_AGE_MS;
  for (const job of jobs) {
    if (job.status !== "launched" && job.status !== "running") continue;
    if (new Date(job.created_at).getTime() < cutoff) continue;
    return job;
  }
  return null;
}

function lastLaunchedAt(jobs: CodingAgentJob[]): Date | null {
  let latest: Date | null = null;
  for (const job of jobs) {
    if (!job.cursor_agent_id) continue;
    const at = new Date(job.created_at);
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

export function evaluateCodingQuota(
  jobs: CodingAgentJob[],
  now: Date = new Date()
): QuotaSnapshot {
  const today = jerusalemCalendarDate(now);
  const todayLaunches = launchedToday(jobs, today);
  const usedToday = todayLaunches.length;
  const remainingToday = Math.max(0, CODING_TASK_DAILY_LIMIT - usedToday);
  const inFlightJob = activeInFlight(jobs, now);
  const lastLaunch = lastLaunchedAt(jobs);

  let cooldownMinutesLeft = 0;
  if (lastLaunch) {
    const elapsedMs = now.getTime() - lastLaunch.getTime();
    const requiredMs = CODING_TASK_COOLDOWN_MINUTES * 60 * 1000;
    if (elapsedMs < requiredMs) {
      cooldownMinutesLeft = Math.ceil((requiredMs - elapsedMs) / 60_000);
    }
  }

  let blockReason: QuotaBlockReason | null = null;
  if (usedToday >= CODING_TASK_DAILY_LIMIT) blockReason = "daily_limit";
  else if (inFlightJob) blockReason = "in_flight";
  else if (cooldownMinutesLeft > 0) blockReason = "cooldown";

  return {
    dailyLimit: CODING_TASK_DAILY_LIMIT,
    usedToday,
    remainingToday,
    inFlight: Boolean(inFlightJob),
    cooldownMinutesLeft,
    blockReason,
  };
}

export function formatQuotaBlockedHebrew(snapshot: QuotaSnapshot): string {
  const remaining = snapshot.remainingToday;
  if (snapshot.blockReason === "daily_limit") {
    return `הגעת למכסה היומית (${snapshot.dailyLimit} משימות קוד ביום). נסה מחר. נותרו היום: 0.`;
  }
  if (snapshot.blockReason === "in_flight") {
    return `כבר רץ סוכן קוד (משימה אחת בו-זמנית). המתן לסיום ונסה שוב. נותרו היום: ${remaining}.`;
  }
  if (snapshot.blockReason === "cooldown") {
    return `המתן ${snapshot.cooldownMinutesLeft} דקות בין השקות קוד. נותרו היום: ${remaining}.`;
  }
  return `לא ניתן להשיק סוכן קוד כרגע. נותרו היום: ${remaining}.`;
}
