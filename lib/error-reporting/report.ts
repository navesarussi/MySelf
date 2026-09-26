import { getWebhookConfig } from "./config";
import { isNoisyReport, persistAndDecide } from "./dedupe";
import { buildPayload } from "./payload";
import { scheduleErrorReport } from "./schedule";
import type { ReportErrorInput } from "./types";

const WEBHOOK_TIMEOUT_MS = 2500;

async function postWebhook(url: string, key: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // Fire-and-forget — never propagate.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Forward a real error to the maintainer webhook. Never throws; never blocks callers.
 * Work is scheduled with Next.js after() so Vercel keeps the function alive post-response.
 */
export function reportError(input: ReportErrorInput): void {
  scheduleErrorReport(() => reportErrorAsync(input));
}

export async function reportErrorAsync(input: ReportErrorInput): Promise<void> {
  try {
    const isTest = input.context?.test === true;
    const draft = buildPayload(input);
    const noisy = isTest ? false : isNoisyReport(input.error, draft);
    const decision = await persistAndDecide({
      fingerprint: draft.fingerprint,
      payload: draft,
      noisy,
      forceSend: isTest,
    });

    if (!decision.shouldSend) return;

    const config = await getWebhookConfig();
    if (!config) return;

    const payload = {
      ...draft,
      firstSeen: decision.firstSeen,
      occurrenceCount: decision.occurrenceCount,
    };

    await postWebhook(config.url, config.key, payload);
  } catch {
    // Swallow all reporter failures.
  }
}

/** Integration failures with upstream response context. */
export function reportIntegrationError(
  integration: NonNullable<ReportErrorInput["context"]>["integration"],
  error: unknown,
  context?: Omit<NonNullable<ReportErrorInput["context"]>, "integration">
): void {
  reportError({
    source: context?.environment === "cron" ? "cron" : "server",
    error,
    context: { ...context, integration },
  });
}
