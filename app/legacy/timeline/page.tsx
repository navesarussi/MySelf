import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import { getTranslations } from "@/lib/i18n";
import type { TimelineEvent } from "@/lib/types";
import type { LifePeriod } from "@/lib/life-periods";
import { TimelineBoard } from "./timeline-board";
import { TimelineAddModal } from "./timeline-add-modal";
import { TimelineSyncBar } from "./sync-bar";
import { isEventHidden } from "@/lib/timeline-display";
import { isAddTarget } from "@/lib/add-menu";
import { getIntegrationToken, isGoogleConnected } from "@/lib/integrations/tokens";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";

export const dynamic = "force-dynamic";

async function getEvents(): Promise<TimelineEvent[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("timeline_events")
    .select("*")
    .order("event_date", { ascending: false })
    .limit(10000);
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
  const connected = await isGoogleConnected();
  const token = connected ? await getIntegrationToken(GOOGLE_PROVIDER) : null;

  return (
    <>
      <PageHeader title={t("timeline.title")} subtitle={t("timeline.subtitleFull")} />

      {add === "event" && <TimelineAddModal kind="event" />}
      {add === "period" && <TimelineAddModal kind="period" />}

      <TimelineSyncBar
        connected={connected}
        lastSyncAt={token?.last_sync_at ?? null}
        initialSyncStatus={token?.sync_status ?? "idle"}
      />

      <TimelineBoard events={visibleEvents} periods={periods} />
    </>
  );
}
