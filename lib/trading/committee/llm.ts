import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { AGENT_MODEL_ID } from "../config";

export type LlmCallResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type CommitteeLlmClient = {
  generateObject: <T>(input: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    timeoutMs: number;
  }) => Promise<LlmCallResult<T>>;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("COMMITTEE_TIMEOUT")), timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Default Gemini client — inject a mock in tests. */
export function createGeminiCommitteeLlm(): CommitteeLlmClient {
  return {
    async generateObject({ system, prompt, schema, timeoutMs }) {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        return { ok: false, error: "missing_gemini_api_key" };
      }
      try {
        const result = await withTimeout(
          generateText({
            model: google(AGENT_MODEL_ID),
            system,
            prompt,
            output: Output.object({ schema }),
            temperature: 0.2,
          }),
          timeoutMs,
        );
        const parsed = schema.safeParse(result.output);
        if (!parsed.success) {
          return { ok: false, error: `schema_violation: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
        }
        return { ok: true, data: parsed.data };
      } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 200) : "llm_error";
        return { ok: false, error: msg };
      }
    },
  };
}
