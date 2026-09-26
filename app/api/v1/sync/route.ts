import { NextRequest, NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken, tryStartSync } from "@/lib/integrations/tokens";
import { currentUserId } from "@/lib/db/current-user";
import { runAsUser } from "@/lib/db/user-context";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { withRouteHandler } from "@/lib/api/with-route-handler";

/** Manual calendar sync from the app — same behavior as the web's manual sync. */
export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  if (!token) {
    return NextResponse.json({ ok: false, error: "not_connected" }, { status: 400 });
  }

  const started = await tryStartSync(GOOGLE_PROVIDER);
  if (!started) {
    return NextResponse.json({ ok: true, alreadyRunning: true });
  }

  const account = await currentUserId();
  after(() => runAsUser(account, async () => {
    try {
      await syncGoogleCalendar();
      revalidatePath("/timeline");
      revalidatePath("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "sync_failed";
      console.error("[google-sync-v1]", message);
    }
  }));

  return NextResponse.json({ ok: true, started: true });
});
