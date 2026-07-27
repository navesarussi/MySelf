import { NextRequest, NextResponse } from "next/server";
import {
  badRequest,
  isApiAuthorized,
  readJson,
  unauthorized,
} from "@/lib/api/auth";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferencesPatch,
} from "@/lib/push/preferences";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const prefs = await getNotificationPreferences();
  return NextResponse.json(prefs);
}

export async function PATCH(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const patch: NotificationPreferencesPatch = {};

  for (const key of [
    "enabled",
    "agent",
    "relationships",
    "habits",
    "tasks",
    "timeline",
  ] as const) {
    if (key in body) patch[key] = Boolean(body[key]);
  }
  if ("quiet_start_hour" in body) patch.quiet_start_hour = Number(body.quiet_start_hour);
  if ("quiet_end_hour" in body) patch.quiet_end_hour = Number(body.quiet_end_hour);

  try {
    const prefs = await updateNotificationPreferences(patch);
    return NextResponse.json(prefs);
  } catch (err) {
    const code = err instanceof Error ? err.message : "update_failed";
    if (code === "invalid_quiet_start" || code === "invalid_quiet_end") {
      return badRequest(code);
    }
    return NextResponse.json({ error: code }, { status: 500 });
  }
}
