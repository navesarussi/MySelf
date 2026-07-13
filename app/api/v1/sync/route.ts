import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken, tryStartSync } from "@/lib/integrations/tokens";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";

/** Manual calendar sync from the app — same behavior as the web's manual sync. */
export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  if (!token) {
    return NextResponse.json({ ok: false, error: "not_connected" }, { status: 400 });
  }

  const started = await tryStartSync(GOOGLE_PROVIDER);
  if (!started) {
    return NextResponse.json({ ok: true, alreadyRunning: true });
  }

  try {
    const { imported, removed } = await syncGoogleCalendar();
    revalidatePath("/timeline");
    revalidatePath("/");
    return NextResponse.json({ ok: true, imported, removed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync_failed";
    console.error("[google-sync-v1]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
