import { getUnscopedSupabase } from "@/lib/supabase";
import { isAuthorizedWhatsAppSender as phonesMatch } from "@/lib/whatsapp/phone-match";

type AgentPhoneRow = { user_id: string; whatsapp_phone: string | null };

/** Pure part: the one enabled account registered for this number, else null. */
export function pickAccountForSender(from: string, rows: AgentPhoneRow[]): string | null {
  const matches = rows.filter((row) => phonesMatch(from, row.whatsapp_phone));
  // A number registered on two accounts is ambiguous: answer neither rather than guess.
  return matches.length === 1 ? matches[0].user_id : null;
}

/**
 * Which account an inbound WhatsApp message is for. The webhook carries no
 * session — the sender's number, registered in that account's agent settings,
 * is the only identity — so this is the one read across all accounts' settings.
 */
export async function accountForWhatsAppSender(from: string): Promise<string | null> {
  const { data, error } = await getUnscopedSupabase()
    .from("agent_settings")
    .select("user_id, whatsapp_phone")
    .eq("enabled", true)
    .not("whatsapp_phone", "is", null);
  if (error || !data) return null;
  return pickAccountForSender(from, data as AgentPhoneRow[]);
}
