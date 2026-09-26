import { NextRequest, NextResponse } from "next/server";
import { badRequest, readJson, str, denyUnlessPrimary } from "@/lib/api/auth";
import { resolveChatCommand } from "@/lib/trading/chat";
import { executeCommand } from "@/lib/trading/service";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const maxDuration = 60;

/** The only path from a chat proposal to an action: an explicit tap in the app. */
export const POST = withRouteHandler(async function POST(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  const body = await readJson(req);
  const id = str(body.message_id);
  if (!id || typeof body.confirm !== "boolean") return badRequest("invalid_request");
  try {
    return NextResponse.json(await resolveChatCommand(id, body.confirm, (cmd) => executeCommand(cmd, "chat")));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "confirm_failed" }, { status: 409 });
  }
});
