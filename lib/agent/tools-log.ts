import { logAgentAction } from "@/lib/agent/log";

/**
 * Run a tool call and record it, successes and failures alike.
 *
 * Every `tools-*` module needs this, and each one used to carry its own
 * byte-identical copy — four of them — so a change to how tool calls are
 * logged had to be made four times.
 */
export async function withLog<T>(name: string, input: unknown, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    await logAgentAction({ tool_name: name, tool_input: input, tool_result: result });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "tool_failed";
    await logAgentAction({ tool_name: name, tool_input: input, tool_result: { error: message } });
    throw err;
  }
}
