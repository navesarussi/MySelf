import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import { getTranslations } from "@/lib/i18n";
import type { TimelineEvent } from "@/lib/types";
import type { LifePeriod } from "@/lib/life-periods";
import { TimelineBoard } from "./timeline-board";
import { TimelineAddForms } from "./timeline-add-forms";
import { TimelineSyncBar } from "./sync-bar";
import { isEventHidden } from "@/lib/timeline-display";
import { isAddTarget } from "@/lib/add-menu";

export const revalidate = 30;

async function getEvents(): Promise<TimelineEvent[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("timeline_events")
    .select("*")
    .order("event_date", { ascending: false });
  return (data || []) as TimelineEvent[];
}

async function getPeriods(): Promise<LifePeriod[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("life_periods")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data || []) as LifePeriod[];
}

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { t } = await getTranslations();
  const sp = await searchParams;
  const add = isAddTarget(sp.add) ? sp.add : undefined;

  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title={t("timeline.title")} subtitle={t("timeline.subtitle")} />
        <DbWarning />
      </>
    );
  }

  const [events, periods] = await Promise.all([getEvents(), getPeriods()]);
  const visibleEvents = events.filter((e) => !isEventHidden(e));

  return (
    <>
      <PageHeader title={t("timeline.title")} subtitle={t("timeline.subtitleFull")} />

      <TimelineAddForms openEvent={add === "event"} openPeriod={add === "period"} />

      <TimelineSyncBar />

      <TimelineBoard events={visibleEvents} periods={periods} />
    </>
  );
}
