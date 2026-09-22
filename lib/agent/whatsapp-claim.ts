import { getSupabase } from "@/lib/supabase";

export type ClaimResult = "claimed" | "duplicate" | "error";

type SelectChain = {
  eq: (col: string, val: unknown) => SelectChain;
  limit: (n: number) => Promise<{ data: { id: string }[] | null; error: { message: string } | null }>;
};

/** The slice of the Supabase client this helper uses. Injectable so the claim
 *  logic — the part that went wrong — can be tested without a database. */
export type ClaimClient = {
  from: (table: string) => {
    select: (cols: string) => SelectChain;
    insert: (
      row: Record<string, unknown>
    ) => Promise<{ error: { code?: string; message: string } | null }>;
  };
};

/**
 * Claim one `agent_messages` row for a WhatsApp external id, so a Meta webhook
 * retry cannot make the agent process an inbound twice or reply twice.
 *
 * The unique indexes from migrations 0035 and 0036 are the real guard. Until
 * those are applied this select-then-insert is all there is, so it has to fail
 * closed — and it previously did the opposite.
 *
 * Both callers read with `.maybeSingle()` and destructured only `data`.
 * `.maybeSingle()` raises an error when more than one row matches and hands
 * back `data: null`, which the caller read as "nothing here" and answered by
 * inserting another row. Once a message had two copies the check could never
 * succeed again, so every retry added one more. Production shows the shape of
 * that: inbound messages with 123, 85 and 74 copies accumulated over six days,
 * each copy an agent run and a reply.
 *
 * `.limit(1)` cannot raise that error, and a read that genuinely fails now
 * returns "error" — the webhook then skips processing and lets Meta retry —
 * instead of being taken as proof that no claim exists.
 */
export async function claimAgentMessage(opts: {
  externalId: string;
  direction: "inbound" | "outbound";
  placeholder: string;
  logTag: string;
  client?: ClaimClient;
}): Promise<ClaimResult> {
  const { externalId, direction, placeholder, logTag } = opts;
  const sb = (opts.client ?? getSupabase()) as ClaimClient;

  const { data: existing, error: checkError } = await sb
    .from("agent_messages")
    .select("id")
    .eq("external_id", externalId)
    .eq("direction", direction)
    .eq("channel", "whatsapp")
    .limit(1);
  if (checkError) {
    console.error(`[${logTag}] claim_check_failed`, checkError.message);
    return "error";
  }
  if (existing && existing.length > 0) return "duplicate";

  const { error } = await sb.from("agent_messages").insert({
    direction,
    channel: "whatsapp",
    content: placeholder,
    external_id: externalId,
  });
  if (!error) return "claimed";
  if (error.code === "23505") return "duplicate";
  console.error(`[${logTag}] claim_failed`, error.message);
  return "error";
}
