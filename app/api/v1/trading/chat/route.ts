import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, readJson, str, denyUnlessPrimary } from "@/lib/api/auth";
import { getChatHistory, runTradingChat } from "@/lib/trading/chat";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await getChatHistory());
  } catch {
    return dbError();
  }
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  const message = str((await readJson(req)).message);
  if (!message) return badRequest("message_required");
  try {
    return NextResponse.json(await runTradingChat(message));
  } catch (err) {
    const code = err instanceof Error ? err.message : "chat_failed";
    return NextResponse.json({ error: code }, { status: code === "missing_gemini_api_key" ? 503 : 500 });
  }
}
