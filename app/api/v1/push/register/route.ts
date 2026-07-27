import { NextRequest, NextResponse } from "next/server";
import {
  badRequest,
  isApiAuthorized,
  readJson,
  unauthorized,
} from "@/lib/api/auth";
import { deletePushToken, upsertPushToken } from "@/lib/push/tokens";
import type { PushPlatform } from "@/lib/push/types";

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const expoPushToken = String(body.expo_push_token ?? "").trim();
  const platform = String(body.platform ?? "ios") as PushPlatform;
  const deviceId =
    body.device_id === null || body.device_id === undefined
      ? null
      : String(body.device_id);

  try {
    await upsertPushToken({ expoPushToken, platform, deviceId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const code = err instanceof Error ? err.message : "register_failed";
    if (code === "invalid_token" || code === "invalid_platform") {
      return badRequest(code);
    }
    return NextResponse.json({ error: code }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const expoPushToken = String(body.expo_push_token ?? "").trim();
  if (!expoPushToken) return badRequest("invalid_token");

  try {
    await deletePushToken(expoPushToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const code = err instanceof Error ? err.message : "unregister_failed";
    return NextResponse.json({ error: code }, { status: 500 });
  }
}
