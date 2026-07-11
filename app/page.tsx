import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { Badge } from "@/components/ui";
import type { Habit, Goal, Commitment, Relationship, TimelineEvent } from "@/lib/types";
import { Compass, Clock, Target, Users, BookOpen, Flame, AlertCircle } from "lucide-react";

export const revalidate = 30;

const modules = [
  { href: "/timeline", label: "ציר זמן", icon: Clock, desc: "האירועים החשובים בחיים שלך" },
  { href: "/habits", label: "הרגלים ומטרות", icon: Target, desc: "הרגלים, משימות, מטרות וחלומות" },
  { href: "/relationships", label: "ניהול קשרים", icon: Users, desc: "משפחה, חברים, בת/בן זוג" },
  { href: "/library", label: "ספריית תוכן", icon: BookOpen, desc: "פסיכולוגיה, פחדים, קשרים, סיפורים" },
];

export default async function HomePage() {
  const configured = dbConfigured();

  let habits: Habit[] = [];
  let activeGoalsCount = 0;
  let pendingCommitments: Commitment[] = [];
  let overdueRelationships: Relationship[] = [];
  let recentEvents: TimelineEvent[] = [];

  if (configured) {
    const supabase = getSupabase();
    const [habitsRes, goalsRes, commitmentsRes, relRes, eventsRes] = await Promise.all([
      supabase.from("habits").select("id, name, streak_count").eq("archived", false),
      supabase.from("goals").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("commitments").select("id, text, commitment_date").eq("status", "pending").order("commitment_date", { ascending: false }).limit(5),
      supabase.from("relationships").select("id, name, last_contact_date, reminder_days"),
      supabase.from("timeline_events").select("id, title, event_date").order("event_date", { ascending: false }).limit(3),
    ]);
    habits = (habitsRes.data as Habit[]) || [];
    activeGoalsCount = goalsRes.count || 0;
    pendingCommitments = (commitmentsRes.data as Commitment[]) || [];
    recentEvents = (eventsRes.data as TimelineEvent[]) || [];

    const today = new Date();
    overdueRelationships = ((relRes.data as Relationship[]) || []).filter((r) => {
      if (r.reminder_days == null) return false;
      const days = r.last_contact_date ? differenceInCalendarDays(today, new Date(r.last_contact_date)) : Infinity;
      return days >= r.reminder_days;
    });
  }

  return (
    <>
      <div className="card mb-8 p-6">
        <div className="flex items-center gap-2 text-accent">
          <Compass size={18} />
          <span className="text-sm font-medium">המצפן שלי</span>
        </div>
        <p className="mt-3 text-lg font-medium leading-relaxed">
          "לשאוף ליותר, להסתפק בפחות, ולחיות עוד יום על מי מנוחות."
        </p>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          ללמוד להרים את הראש בלי להרים את האף, להילחם כל יום בגבולות של עצמי ולחלום להציב את
          הרף. שאיפה מרכזית: לעשות הרבה כדי לתת הרבה — בכסף, בידע ובאהבה.
        </p>
      </div>

      {!configured && <div className="mb-8"><DbWarning /></div>}

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {modules.map((m) => (
          <Link key={m.href} href={m.href} className="card group p-4 transition hover:border-accent/50">
            <m.icon size={20} className="text-accent" />
            <h3 className="mt-3 font-semibold">{m.label}</h3>
            <p className="mt-1 text-xs text-muted">{m.desc}</p>
          </Link>
        ))}
      </div>

      {configured && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <Flame size={16} className="text-accent2" /> הרגלים פעילים
            </h3>
            {habits.length === 0 ? (
              <p className="text-sm text-muted">אין עדיין הרגלים במעקב.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {habits.map((h) => (
                  <li key={h.id} className="flex items-center justify-between">
                    <span>{h.name}</span>
                    <Badge tone={h.streak_count > 0 ? "good" : "default"}>{h.streak_count} ימים</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <Target size={16} className="text-accent" /> יעדים פעילים
            </h3>
            <p className="text-2xl font-bold">{activeGoalsCount}</p>
            <p className="text-sm text-muted">יעדים וחלומות בעבודה כרגע</p>
            <Link href="/habits" className="mt-2 inline-block text-sm text-accent hover:underline">
              לצפייה ברשימה המלאה ←
            </Link>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <AlertCircle size={16} className="text-warn" /> קשרים שמחכים לתשומת לב
            </h3>
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
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <Clock size={16} className="text-accent" /> אירועים אחרונים בציר הזמן
            </h3>
            {recentEvents.length === 0 ? (
              <p className="text-sm text-muted">אין עדיין אירועים.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {recentEvents.map((e) => (
                  <li key={e.id} className="flex justify-between">
                    <span>{e.title}</span>
                    <span className="text-muted">{new Date(e.event_date).toLocaleDateString("he-IL")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pendingCommitments.length > 0 && (
            <div className="card p-4 lg:col-span-2">
              <h3 className="mb-3 font-semibold">התחייבויות ממתינות</h3>
              <ul className="space-y-1 text-sm">
                {pendingCommitments.map((c) => (
                  <li key={c.id} className="flex justify-between">
                    <span>{c.text}</span>
                    <span className="text-muted">{new Date(c.commitment_date).toLocaleDateString("he-IL")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
