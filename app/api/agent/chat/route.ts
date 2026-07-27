import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, readJson, str, unauthorized, badRequest } from "@/lib/api/auth";
import { runAgentChat } from "@/lib/agent/run";

/** Test the motivation agent from the app (session auth). */
export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const message = str(body.message);
  if (!message) return badRequest("message_required");

  try {
    const result = await runAgentChat({ message, channel: "app", logInbound: true });
    return NextResponse.json(result);
  } catch (err) {
    const code = err instanceof Error ? err.message : "agent_error";
    const status = code === "missing_gemini_api_key" ? 503 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
