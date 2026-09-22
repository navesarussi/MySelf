import { mapAgentErrorCode } from "@/lib/agent/whatsapp-outbound";

/** Thrown when Google AI Studio prepayment credits are exhausted. */
export const GEMINI_CREDITS_DEPLETED = "gemini_credits_depleted";

/** Normalize Gemini failures using shared mapAgentErrorCode (PR #20). */
export function mapGeminiError(err: unknown): Error {
  const code = mapAgentErrorCode(err);
  if (code === GEMINI_CREDITS_DEPLETED) return new Error(GEMINI_CREDITS_DEPLETED);
  if (err instanceof Error) return err;
  return new Error(String(err));
}
