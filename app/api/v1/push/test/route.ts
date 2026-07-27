import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { notifyUser } from "@/lib/push/notify";
import { jerusalemParts } from "@/lib/push/time";

/** Authenticated test push — bypasses quiet hours; ref includes timestamp for uniqueness. */
export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const { dayKey, hour } = jerusalemParts();
  const result = await notifyUser(
    "test",
    {
      title: "MeAndMySelf",
      body: "בדיקת התראה — הכל עובד 🎉",
      data: { screen: "/settings", type: "test" },
    },
    `test-${dayKey}-${hour}-${Date.now()}`
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 200 });
  }
  return NextResponse.json({
    ok: true,
    sent: result.result.sent,
    failed: result.result.failed,
  });
}
