import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { AGENT_MODEL_ID } from "../config";
import { COMMITTEE_PROMPT_VERSIONS, getCommitteeConfig } from "./config";

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

function dryRunScoreFromPrompt(prompt: string): number {
  const m = prompt.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 70;
}

function dryRunSymbolFromPrompt(prompt: string): string {
  return prompt.match(/"symbol"\s*:\s*"([^"]+)"/)?.[1] ?? "STUB";
}

/** Deterministic stub — no API key or credits required; for smoke tests in prod. */
export function createDryRunCommitteeLlm(): CommitteeLlmClient {
  let stage = 0;
  return {
    async generateObject<T>({ schema, prompt }: { system: string; prompt: string; schema: z.ZodType<T>; timeoutMs: number }) {
      const score = dryRunScoreFromPrompt(prompt);
      const symbol = dryRunSymbolFromPrompt(prompt);
      const enter = score >= 75;
      const queue: unknown[] = [
        {
          role: "TECHNICAL",
          symbol,
          stance: score >= 70 ? "BULLISH" : "NEUTRAL",
          confidence: score >= 80 ? 4 : 3,
          key_points: ["dry_run_stub"],
          evidence: [{ source: "dry_run", ref: `score=${score}` }],
          risks: [],
          horizon: "SWING",
          model: "committee-dry-run",
          prompt_version: COMMITTEE_PROMPT_VERSIONS.technical,
        },
        {
          role: "FUNDAMENTAL_NEWS",
          symbol,
          stance: "NEUTRAL",
          confidence: 2,
          key_points: ["DRY_RUN — no live news"],
          evidence: [],
          risks: ["dry_run_mode"],
          horizon: "SWING",
          model: "committee-dry-run",
          prompt_version: COMMITTEE_PROMPT_VERSIONS.fundamental,
        },
        { points: ["dry_run_bull"] },
        { points: ["dry_run_bear"] },
        {
          winner: enter ? "BULL" : "BEAR",
          conviction: enter ? 4 : 2,
          bull_case: ["dry_run_bull"],
          bear_case: ["dry_run_bear"],
          unresolved: [],
          recommended_action: enter ? "ENTER" : "SKIP",
        },
        {
          allow: enter,
          risk_multiplier: enter ? 1 : 0,
          stop_policy: "KEEP",
          reasons: ["dry_run_stub"],
          red_flags: [],
        },
      ];
      const data = queue[stage++];
      if (!data) return { ok: false, error: "dry_run_unexpected_call" };
      const parsed = schema.safeParse(data);
      if (!parsed.success) return { ok: false, error: "dry_run_schema_mismatch" };
      return { ok: true, data: parsed.data };
    },
  };
}

/** Select live Gemini or dry-run stub based on env (default: live when key present). */
export function createCommitteeLlm(): CommitteeLlmClient {
  const cfg = getCommitteeConfig();
  if (cfg.dryRunLlm) return createDryRunCommitteeLlm();
  return createGeminiCommitteeLlm();
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
