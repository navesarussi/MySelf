import { getSupabase } from "@/lib/supabase";
import type { AgentChannel } from "@/lib/agent/types";
import { notifyAgentActionWrite } from "@/lib/agent/action-push";

export async function logAgentMessage(input: {
  direction: "inbound" | "outbound";
  channel: AgentChannel;
  content: string;
  external_id?: string | null;
}) {
  await getSupabase().from("agent_messages").insert({
    direction: input.direction,
    channel: input.channel,
    content: input.content,
    external_id: input.external_id ?? null,
  });
}

export async function logAgentAction(input: {
  tool_name: string;
  tool_input: unknown;
  tool_result: unknown;
}) {
  const { data, error } = await getSupabase()
    .from("agent_actions")
    .insert({
      tool_name: input.tool_name,
      tool_input: input.tool_input ?? null,
      tool_result: input.tool_result ?? null,
    })
    .select("id")
    .single();

  if (error || !data?.id) return;

  void notifyAgentActionWrite(data.id, input.tool_name, input.tool_result).catch((err) => {
    console.error("[agent-action-push]", err instanceof Error ? err.message : "push_failed");
  });
}
