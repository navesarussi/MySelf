import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader, SubmitButton } from "@/components/ui";
import { googleConfigured } from "@/lib/integrations/google-config";
import { getIntegrationToken, isGoogleConnected } from "@/lib/integrations/tokens";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { triggerGoogleSync, disconnectGoogle } from "./actions";
import Link from "next/link";

export const revalidate = 30;

function formatWhen(iso: string | null) {
  if (!iso) return "טרם סונכרן";
  return new Date(iso).toLocaleString("he-IL");
}

export default async function SettingsPage() {
  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title="הגדרות" />
        <DbWarning />
      </>
    );
  }

  const googleReady = googleConfigured();
  const connected = googleReady ? await isGoogleConnected() : false;
  const token = connected ? await getIntegrationToken(GOOGLE_PROVIDER) : null;

  let calendarEventCount = 0;
  if (connected) {
    const supabase = getSupabase();
    const { count } = await supabase
      .from("timeline_events")
      .select("id", { count: "exact", head: true })
      .eq("source", "google_calendar");
    calendarEventCount = count ?? 0;
  }

  return (
    <>
      <PageHeader title="הגדרות" subtitle="חיבורים ואינטגרציות" />

      <section className="card p-4">
        <h2 className="text-sm font-semibold">יומן גוגל</h2>

        {!googleReady && (
          <p className="mt-3 text-sm text-muted">
            חסרים משתני סביבה: <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>,{" "}
            <code>GOOGLE_REDIRECT_URI</code>. ראה <code>.env.example</code>.
          </p>
        )}

        {googleReady && !connected && (
          <div className="mt-3">
            <p className="text-sm text-muted">
              התחבר מחדש עם Google כדי לחבר את היומן לציר הזמן.
            </p>
            <Link
              href="/api/auth/google/login?next=/settings"
              className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              כניסה עם Google
            </Link>
          </div>
        )}

        {googleReady && connected && (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-good">מחובר</p>
            <p className="text-muted">סנכרון אחרון: {formatWhen(token?.last_sync_at ?? null)}</p>
            <p className="text-muted">אירועים מיובאים: {calendarEventCount}</p>
            <p className="text-xs text-muted">סנכרון אוטומטי: פעם בשבוע</p>

            <form action={triggerGoogleSync}>
              <SubmitButton>סנכרון עכשיו</SubmitButton>
            </form>

            <form action={disconnectGoogle}>
              <button type="submit" className="text-sm text-warn hover:underline">
                ניתוק יומן גוגל
              </button>
            </form>
          </div>
        )}
      </section>
    </>
  );
}
