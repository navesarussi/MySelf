import { NextRequest, NextResponse } from "next/server";
import { badRequest, isApiAuthorized, readJson, unauthorized } from "@/lib/api/auth";
import { executeCommand, parseCommand } from "@/lib/trading/service";

export const maxDuration = 60;

/** Live controls. Every destructive action requires `confirm: true` from the client. */
export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const cmd = parseCommand(body);
  if (!cmd) return badRequest("invalid_command");
  const destructive = ["close_position", "close_all", "rearm_kill_switch", "set_phase"].includes(cmd.action);
  if (destructive && body.confirm !== true) return badRequest("confirmation_required");
  try {
    return NextResponse.json(await executeCommand(cmd, "app"));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "command_failed" }, { status: 409 });
  }
}
