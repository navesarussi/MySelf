import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, readJson, str, unauthorized, badRequest } from "@/lib/api/auth";
import { runAgentChat, type AgentImageInput } from "@/lib/agent/run";

function parseImages(body: Record<string, unknown>): AgentImageInput[] {
  const raw = body.images;
  if (!Array.isArray(raw)) return [];
  const out: AgentImageInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const data = typeof o.data === "string" ? o.data : "";
    const mimeType = typeof o.mimeType === "string" ? o.mimeType : "image/jpeg";
    if (data.length > 100) out.push({ data, mimeType });
  }
  return out.slice(0, 3);
}

/** App chat with optional image attachments (Cover screenshots, etc.). */
export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const message = str(body.message);
  const images = parseImages(body as Record<string, unknown>);
  if (!message && images.length === 0) return badRequest("message_required");

  try {
    const result = await runAgentChat({ message, images, channel: "app", logInbound: true });
    return NextResponse.json(result);
  } catch (err) {
    const code = err instanceof Error ? err.message : "agent_error";
    const status = code === "missing_gemini_api_key" ? 503 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
