import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { setFlashCookie } from "@/lib/flash";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isCron = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

  try {
    const { imported, removed } = await syncGoogleCalendar();
    if (!isCron) {
      const jar = await cookies();
      setFlashCookie(jar, `יומן גוגל סונכרן — ${imported} אירועים`);
    }
    return NextResponse.json({ ok: true, imported, removed });
  } catch {
    if (!isCron) {
      const jar = await cookies();
      setFlashCookie(jar, "סנכרון נכשל — נסה שוב", "error");
    }
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
