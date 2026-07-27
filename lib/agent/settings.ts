import { getSupabase } from "@/lib/supabase";
import { isValidPhone, normalizePhone } from "@/lib/integrations/phone";
import { isAuthorizedWhatsAppSender as phonesMatch } from "@/lib/whatsapp/phone-match";
import type { AgentSettings, AgentTone } from "@/lib/agent/types";

const TONES: AgentTone[] = ["warm", "direct", "humorous"];
const DEFAULT_DIG_HOURS = [8, 13, 21];

const DEFAULTS: AgentSettings = {
  enabled: false,
  whatsapp_phone: null,
  morning_hour: 8,
  midday_hour: 13,
  evening_hour: 21,
  dig_hours: DEFAULT_DIG_HOURS,
  tone: "warm",
  system_prompt: null,
  updated_at: new Date().toISOString(),
};

function normalizeDigHours(raw: unknown, fallback: number[]): number[] {
  const list = Array.isArray(raw)
    ? raw.map((h) => Number(h)).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
    : [];
  const unique = [...new Set(list)].sort((a, b) => a - b);
  if (unique.length < 1 || unique.length > 6) return fallback;
  return unique;
}

function rowToSettings(row: Record<string, unknown>): AgentSettings {
  const tone = String(row.tone);
  const morning = Number(row.morning_hour ?? 8);
  const midday = Number(row.midday_hour ?? 13);
  const evening = Number(row.evening_hour ?? 21);
  const dig_hours = normalizeDigHours(row.dig_hours, [morning, midday, evening]);
  return {
    enabled: Boolean(row.enabled),
    whatsapp_phone: typeof row.whatsapp_phone === "string" ? row.whatsapp_phone : null,
    morning_hour: dig_hours[0] ?? morning,
    midday_hour: dig_hours[Math.min(1, dig_hours.length - 1)] ?? midday,
    evening_hour: dig_hours[dig_hours.length - 1] ?? evening,
    dig_hours,
    tone: (TONES as string[]).includes(tone) ? (tone as AgentTone) : "warm",
    system_prompt: typeof row.system_prompt === "string" ? row.system_prompt : null,
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function getAgentSettings(): Promise<AgentSettings> {
  const { data, error } = await getSupabase()
    .from("agent_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return DEFAULTS;
  return rowToSettings(data as Record<string, unknown>);
}

export type AgentSettingsPatch = Partial<
  Pick<
    AgentSettings,
    | "enabled"
    | "whatsapp_phone"
    | "morning_hour"
    | "midday_hour"
    | "evening_hour"
    | "dig_hours"
    | "tone"
    | "system_prompt"
  >
>;

export async function updateAgentSettings(patch: AgentSettingsPatch): Promise<AgentSettings> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.enabled !== undefined) body.enabled = patch.enabled;
  if (patch.tone !== undefined && (TONES as string[]).includes(patch.tone)) {
    body.tone = patch.tone;
  }
  if (patch.system_prompt !== undefined) {
    body.system_prompt = patch.system_prompt?.trim() || null;
  }
  if (patch.whatsapp_phone !== undefined) {
    const raw = patch.whatsapp_phone?.trim() || null;
    if (raw && !isValidPhone(raw)) throw new Error("invalid_phone");
    body.whatsapp_phone = raw ? normalizePhone(raw) : null;
  }

  if (patch.dig_hours !== undefined) {
    const hours = normalizeDigHours(patch.dig_hours, []);
    if (hours.length < 1) throw new Error("invalid_dig_hours");
    body.dig_hours = hours;
    body.morning_hour = hours[0];
    body.midday_hour = hours[Math.min(1, hours.length - 1)];
    body.evening_hour = hours[hours.length - 1];
  } else {
    if (patch.morning_hour !== undefined) body.morning_hour = patch.morning_hour;
    if (patch.midday_hour !== undefined) body.midday_hour = patch.midday_hour;
    if (patch.evening_hour !== undefined) body.evening_hour = patch.evening_hour;
    if (
      patch.morning_hour !== undefined ||
      patch.midday_hour !== undefined ||
      patch.evening_hour !== undefined
    ) {
      const current = await getAgentSettings();
      const next = normalizeDigHours(
        [
          patch.morning_hour ?? current.morning_hour,
          patch.midday_hour ?? current.midday_hour,
          patch.evening_hour ?? current.evening_hour,
        ],
        DEFAULT_DIG_HOURS
      );
      body.dig_hours = next;
    }
  }

  const { data, error } = await getSupabase()
    .from("agent_settings")
    .update(body)
    .eq("id", true)
    .select("*")
    .single();
  if (error || !data) throw new Error("settings_update_failed");
  return rowToSettings(data as Record<string, unknown>);
}

export function isAuthorizedWhatsAppSender(from: string, settings: AgentSettings): boolean {
  return phonesMatch(from, settings.whatsapp_phone);
}

export function motivationKindForHour(hour: number, digHours: number[]): "morning" | "midday" | "evening" | null {
  const sorted = [...digHours].sort((a, b) => a - b);
  const idx = sorted.indexOf(hour);
  if (idx < 0) return null;
  if (idx === 0) return "morning";
  if (idx === sorted.length - 1) return "evening";
  return "midday";
}
