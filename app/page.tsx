import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { Badge } from "@/components/ui";
import { effectiveStreak } from "@/lib/habit-stats";
import { rankGoalsForHome, horizonLabel, achievabilityScore } from "@/lib/goals-rank";
import { formatEventWhen } from "@/lib/timeline-layout";
import type { Habit, Goal, Commitment, Relationship, TimelineEvent, Task } from "@/lib/types";
import {
  Compass,
  Clock,
  Target,
  Flame,
  AlertCircle,
  CheckSquare,
  TrendingUp,
  ThumbsUp,
  AlertTriangle,
  Percent,
} from "lucide-react";

export const revalidate = 30;

export default async function HomePage() {
  const configured = dbConfigured();

  let habits: Habit[] = [];
  let activeGoals: Goal[] = [];
  let doneGoalsCount = 0;
  let pendingCommitments: Commitment[] = [];
  let overdueRelationships: Relationship[] = [];
  let recentEvents: TimelineEvent[] = [];
  let openTasksCount = 0;
  let inProgressTasksCount = 0;

  if (configured) {
    const supabase = getSupabase();
    const [habitsRes, goalsRes, doneGoalsRes, commitmentsRes, relRes, eventsRes, tasksRes] =
      await Promise.all([
        supabase.from("habits").select("*").eq("archived", false),
        supabase.from("goals").select("*").eq("status", "active"),
        supabase.from("goals").select("id", { count: "exact", head: true }).eq("status", "done"),
        supabase
          .from("commitments")
          .select("id, text, commitment_date")
          .eq("status", "pending")
          .order("commitment_date", { ascending: false })
          .limit(5),
        supabase.from("relationships").select("id, name, last_contact_date, reminder_days"),
        supabase.from("timeline_events").select("*").order("event_date", { ascending: false }).limit(5),
        supabase.from("tasks").select("id, status"),
      ]);

    habits = (habitsRes.data as Habit[]) || [];
    activeGoals = (goalsRes.data as Goal[]) || [];
    doneGoalsCount = doneGoalsRes.count || 0;
    pendingCommitments = (commitmentsRes.data as Commitment[]) || [];
    recentEvents = (eventsRes.data as TimelineEvent[]) || [];

    const tasks = (tasksRes.data as Pick<Task, "status">[]) || [];
    openTasksCount = tasks.filter((t) => t.status === "open").length;
    inProgressTasksCount = tasks.filter((t) => t.status === "in_progress").length;

    const today = new Date();
    overdueRelationships = ((relRes.data as Relationship[]) || []).filter((r) => {
      if (r.reminder_days == null) return false;
      const days = r.last_contact_date
        ? differenceInCalendarDays(today, new Date(r.last_contact_date))
        : Infinity;
      return days >= r.reminder_days;
    });
  }

  const totalFailures = habits.reduce((s, h) => s + (h.failure_count ?? 0), 0);
  const activeStreaks = habits.filter((h) => effectiveStreak(h) > 0).length;
  const checkedToday = habits.filter((h) => h.last_checked_on === new Date().toISOString().slice(0, 10)).length;
  const todayRate = habits.length ? Math.round((checkedToday / habits.length) * 100) : 0;
  const featuredGoals = rankGoalsForHome(activeGoals, 5);
  const activeGoalsCount = activeGoals.length;

  return (
    <>
      <div className="card mb-8 p-6">
        <div className="flex items-center gap-2 text-accent">
          <Compass size={18} />
          <span className="text-sm font-medium">המצפן שלי</span>
        </div>
        <p className="mt-3 text-lg font-medium leading-relaxed">
          &quot;לשאוף ליותר, להסתפק בפחות, ולחיות עוד יום על מי מנוחות.&quot;
        </p>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          ללמוד להרים את הראש בלי להרים את האף, להילחם כל יום בגבולות של עצמי ולחלום להציב את
          הרף. שאיפה מרכזית: לעשות הרבה כדי לתת הרבה — בכסף, בידע ובאהבה.
        </p>
      </div>

      {!configured && (
        <div className="mb-8">
          <DbWarning />
        </div>
      )}

      {configured && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-4">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Flame size={15} className="text-accent2" /> הרגלים פעילים
              </div>
              <p className="mt-2 text-3xl font-bold">{habits.length}</p>
              <p className="mt-1 text-xs text-muted">
                {checkedToday}/{habits.length} סומנו היום · {activeStreaks} ברצף
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Percent size={15} className="text-good" /> ביצוע היום
              </div>
              <p className="mt-2 text-3xl font-bold">{todayRate}%</p>
              <p className="mt-1 text-xs text-muted">
                {checkedToday} מתוך {habits.length} הרגלים סומנו
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Target size={15} className="text-accent" /> יעדים פעילים
              </div>
              <p className="mt-2 text-3xl font-bold">{activeGoalsCount}</p>
              <p className="mt-1 text-xs text-muted">{doneGoalsCount} הושגו</p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-sm text-muted">
                <CheckSquare size={15} className="text-accent" /> משימות פתוחות
              </div>
              <p className="mt-2 text-3xl font-bold">{openTasksCount + inProgressTasksCount}</p>
              <p className="mt-1 text-xs text-muted">{inProgressTasksCount} בתהליך</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Flame size={16} className="text-accent2" /> מעקב הרגלים
                </h3>
                <Link href="/habits" className="text-xs text-accent hover:underline">
                  לכל ההרגלים ←
                </Link>
              </div>
              {habits.length === 0 ? (
                <p className="text-sm text-muted">אין עדיין הרגלים במעקב.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {habits.map((h) => {
                    const streak = effectiveStreak(h);
                    return (
                      <li key={h.id} className="rounded-lg bg-border/20 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{h.name}</span>
                          <Badge tone={streak > 0 ? "good" : "default"}>{streak} ברצף</Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted">
                          <span className="flex items-center gap-1">
                            <TrendingUp size={11} /> שיא {h.best_streak}
                          </span>
                          <span className="flex items-center gap-1">
                            <ThumbsUp size={11} /> {h.total_success_days ?? 0} חיוביים
                          </span>
                          <span className="flex items-center gap-1">
                            <AlertTriangle size={11} /> {h.failure_count ?? 0} נפילות
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {totalFailures > 0 && (
                <p className="mt-3 text-xs text-muted">סה״כ נפילות במערכת: {totalFailures}</p>
              )}
            </div>

            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Target size={16} className="text-accent" /> מטרות קרובות וברות השגה
                </h3>
                <Link href="/goals" className="text-xs text-accent hover:underline">
                  לרשימה המלאה ←
                </Link>
              </div>
              {featuredGoals.length === 0 ? (
                <p className="text-sm text-muted">אין עדיין יעדים פעילים.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {featuredGoals.map((g) => (
                    <li key={g.id} className="rounded-lg bg-border/20 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{g.title}</span>
                        {achievabilityScore(g) >= 3 && (
                          <Badge tone="good">מוכן לפעולה</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                        {g.category && <span>{g.category}</span>}
                        {horizonLabel(g) && <span>· {horizonLabel(g)}</span>}
                      </div>
                      {g.first_step && (
                        <p className="mt-1 text-xs text-muted">
                          צעד ראשון: {g.first_step}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {pendingCommitments.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium text-muted">התחייבויות ממתינות</p>
                  <ul className="space-y-1 text-sm">
                    {pendingCommitments.map((c) => (
                      <li key={c.id} className="flex justify-between gap-2">
                        <span className="truncate">{c.text}</span>
                        <span className="shrink-0 text-muted">
                          {new Date(c.commitment_date).toLocaleDateString("he-IL")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <AlertCircle size={16} className="text-warn" /> קשרים שמחכים לתשומת לב
                </h3>
                <Link href="/relationships" className="text-xs text-accent hover:underline">
                  לניהול קשרים ←
                </Link>
              </div>
              {overdueRelationships.length === 0 ? (
                <p className="text-sm text-muted">אין כרגע קשרים באיחור.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {overdueRelationships.map((r) => (
                    <li key={r.id}>{r.name}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Clock size={16} className="text-accent" /> אירועים אחרונים
                </h3>
                <Link href="/timeline" className="text-xs text-accent hover:underline">
                  לציר הזמן ←
                </Link>
              </div>
              {recentEvents.length === 0 ? (
                <p className="text-sm text-muted">אין עדיין אירועים.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {recentEvents.map((e) => (
                    <li key={e.id} className="flex justify-between gap-2">
                      <span className="truncate">{e.title}</span>
                      <span className="shrink-0 text-muted">{formatEventWhen(e)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
