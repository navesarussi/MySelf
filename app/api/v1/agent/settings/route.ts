import { NextRequest, NextResponse } from "next/server";
import { badRequest, isApiAuthorized, readJson, unauthorized } from "@/lib/api/auth";
import { getAgentSettings, updateAgentSettings, type AgentSettingsPatch } from "@/lib/agent/settings";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const settings = await getAgentSettings();
  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const patch: AgentSettingsPatch = {};

  if ("enabled" in body) patch.enabled = Boolean(body.enabled);
  if ("whatsapp_phone" in body) {
    patch.whatsapp_phone =
      body.whatsapp_phone === null ? null : String(body.whatsapp_phone ?? "").trim();
  }
  if ("morning_hour" in body) {
    const h = Number(body.morning_hour);
    if (!Number.isInteger(h) || h < 0 || h > 23) return badRequest("invalid_morning_hour");
    patch.morning_hour = h;
  }
  if ("midday_hour" in body) {
    const h = Number(body.midday_hour);
    if (!Number.isInteger(h) || h < 0 || h > 23) return badRequest("invalid_midday_hour");
    patch.midday_hour = h;
  }
  if ("evening_hour" in body) {
    const h = Number(body.evening_hour);
    if (!Number.isInteger(h) || h < 0 || h > 23) return badRequest("invalid_evening_hour");
    patch.evening_hour = h;
  }
  if ("dig_hours" in body) {
    if (!Array.isArray(body.dig_hours)) return badRequest("invalid_dig_hours");
    const hours = body.dig_hours.map((h) => Number(h));
    if (hours.some((h) => !Number.isInteger(h) || h < 0 || h > 23)) {
      return badRequest("invalid_dig_hours");
    }
    if (hours.length < 1 || hours.length > 6) return badRequest("invalid_dig_hours");
    patch.dig_hours = hours;
  }
  if ("tone" in body) {
    const tone = String(body.tone);
    if (!["warm", "direct", "humorous"].includes(tone)) return badRequest("invalid_tone");
    patch.tone = tone as AgentSettingsPatch["tone"];
  }
  if ("system_prompt" in body) {
    patch.system_prompt =
      body.system_prompt === null ? null : String(body.system_prompt ?? "");
  }

  try {
    const settings = await updateAgentSettings(patch);
    return NextResponse.json(settings);
  } catch (err) {
    const code = err instanceof Error ? err.message : "update_failed";
    if (code === "invalid_phone") return badRequest("invalid_phone");
    return NextResponse.json({ error: code }, { status: 500 });
  }
}
