import { generateText, ToolLoopAgent, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import {
  buildAckReply,
  classifyAgentIntent,
  isSimpleStatusQuery,
  maxStepsForRun,
  toolModeForIntent,
  usesTools,
} from "@/lib/agent/budget";
import { buildAgentContext, type AgentContextOptions } from "@/lib/agent/context";
import { GEMINI_CREDITS_DEPLETED, mapGeminiError } from "@/lib/agent/gemini-errors";
import { buildCompactSystemPrompt, buildDigSystemPrompt, buildSystemPrompt } from "@/lib/agent/prompt";
import { getAgentSettings } from "@/lib/agent/settings";
import { createAgentTools, type AgentTools } from "@/lib/agent/tools";
import type { AgentChannel, MotivationKind } from "@/lib/agent/types";
import { logAgentMessage } from "@/lib/agent/log";
import { sanitizeAgentReply } from "@/lib/agent/reply";
import { GEMINI_MODEL_ID } from "@/lib/ai-model";


export { isSimpleStatusQuery };

export type AgentImageInput = {
  mimeType: string;
  data: string;
};

function requireGeminiKey() {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("missing_gemini_api_key");
  return key;
}

async function generateOnce(input: {
  system: string;
  prompt: string;
  tools?: AgentTools;
  maxSteps?: number;
  messages?: Parameters<ToolLoopAgent<AgentTools>["generate"]>[0]["messages"];
}) {
  try {
    if (input.tools && input.maxSteps) {
      const agent = new ToolLoopAgent({
        model: google(GEMINI_MODEL_ID),
        instructions: input.system,
        tools: input.tools,
        stopWhen: stepCountIs(input.maxSteps),
      });
      if (input.messages) {
        return await agent.generate({ messages: input.messages });
      }
      return await agent.generate({ prompt: input.prompt });
    }

    const { text } = await generateText({
      model: google(GEMINI_MODEL_ID),
      system: input.system,
      prompt: input.prompt,
      maxOutputTokens: 256,
    });
    return { text: text ?? "", steps: [] as unknown[] };
  } catch (err) {
    throw mapGeminiError(err);
  }
}

export async function runAgentChat(input: {
  message: string;
  images?: AgentImageInput[];
  channel: AgentChannel;
  logInbound?: boolean;
  contextOptions?: AgentContextOptions;
}) {
  requireGeminiKey();
  const settings = await getAgentSettings();
  const hasImages = Boolean(input.images?.length);
  const context = await buildAgentContext(new Date(), {
    ...input.contextOptions,
    compact: input.channel === "whatsapp",
  });

  const intent =
    input.channel === "whatsapp" ? classifyAgentIntent(input.message, hasImages) : "full";
  const simpleOnApp = input.channel === "app" && isSimpleStatusQuery(input.message) && !hasImages;

  const inboundSummary = hasImages
    ? `${input.message}\n[${input.images!.length} image(s) attached]`
    : input.message;

  if (input.logInbound) {
    await logAgentMessage({
      direction: "inbound",
      channel: input.channel,
      content: inboundSummary,
    });
  }

  // WhatsApp ack: template reply — zero Gemini tokens.
  if (input.channel === "whatsapp" && intent === "ack" && !hasImages) {
    const text = buildAckReply(context);
    await logAgentMessage({ direction: "outbound", channel: input.channel, content: text });
    return { text, steps: 0 };
  }

  const textPrompt =
    input.message.trim() ||
    "נתח את התמונה/המסמך שהמשתמש שלח ועדכן את האפליקציה עם הכלים המתאימים (במיוחד upsert_wealth_item / import_wealth_text).";

  const useToolLoop = usesTools(intent, input.channel) || hasImages;
  const toolMode = toolModeForIntent(intent, input.channel);
  const maxSteps = maxStepsForRun(intent, input.channel, simpleOnApp);

  let result: { text?: string; steps?: unknown[] };

  if (!useToolLoop) {
    result = await generateOnce({
      system: buildCompactSystemPrompt(settings.tone, context),
      prompt: textPrompt,
    });
  } else {
    const tools = createAgentTools({ mode: toolMode });
    const system =
      intent === "status" && input.channel === "whatsapp"
        ? buildCompactSystemPrompt(settings.tone, context)
        : buildSystemPrompt(settings.tone, context, settings.system_prompt);

    const userContent: Array<
      { type: "text"; text: string } | { type: "image"; image: string; mimeType?: string }
    > = [{ type: "text", text: textPrompt }];

    for (const img of input.images ?? []) {
      const dataUrl = img.data.startsWith("data:")
        ? img.data
        : `data:${img.mimeType};base64,${img.data}`;
      userContent.push({ type: "image", image: dataUrl, mimeType: img.mimeType });
    }

    result = await generateOnce({
      system,
      prompt: textPrompt,
      tools,
      maxSteps,
      messages: hasImages ? [{ role: "user", content: userContent }] : undefined,
    });
  }

  let text = result.text?.trim() || "";

  // Empty-text retry: app only — WhatsApp uses outbound fallback (saves a full generate).
  if (!text && input.channel === "app") {
    const retry = await generateOnce({
      system: buildSystemPrompt(settings.tone, context, settings.system_prompt),
      prompt:
        "סכם למשתמש בעברית ב-2–3 משפטים מה עשית עכשיו לפי הכלים שקראת. אל תכתוב שגיאות או 'נסה שוב'.",
      tools: createAgentTools({ mode: "full" }),
      maxSteps: 2,
    });
    text = retry.text?.trim() || "";
    result = retry;
  }

  text = sanitizeAgentReply(text);

  if (!text && input.channel !== "whatsapp") {
    text = "לא הצלחתי לענות כרגע. נסה שוב.";
  }

  await logAgentMessage({
    direction: "outbound",
    channel: input.channel,
    content: text,
  });

  return { text, steps: result.steps?.length ?? 0 };
}

const DIG_PROMPTS: Record<MotivationKind, string> = {
  morning:
    "חפירת בוקר כמנטור קשוח-אוהב: משפט אחד מהנתונים על הפוקוס האמיתי להיום + דרישה/שאלה לפעולה אחת. אם יש gmail_digest בקונטקסט — הוסף משפט אחד על המייל הדחוף/חשוב ביותר (או שאין דחופים). אל תמציא מיילים. עד 40 מילים. בלי סלוגנים, בלי 'אתה יכול', בלי אימוג'ים.",
  midday:
    "חפירת צהריים כמנטור קשוח-אוהב: מה עדיין פתוח/תקוע מהנתונים + דחיפה ברורה לסגור משהו עכשיו. עד 30 מילים. בלי שיווק.",
  evening:
    "חפירת ערב כמנטור קשוח-אוהב: מה לא נסגר היום (הרגל/התחייבות/משימה) + דרישה לסגור לולאה אחת. אם נראה התחמקות — תגיד ישר. עד 30 מילים.",
};

/** Proactive motivation dig — single generateText, no tools. */
async function runMotivationGenerate(
  kind: MotivationKind
): Promise<{ text: string; steps: number }> {
  requireGeminiKey();
  const settings = await getAgentSettings();
  const context = await buildAgentContext(new Date(), {
    gmailDigest: kind === "morning",
    compact: true,
  });

  const result = await generateOnce({
    system: buildDigSystemPrompt(settings.tone, context, settings.system_prompt),
    prompt: DIG_PROMPTS[kind],
  });

  const text = sanitizeAgentReply(result.text?.trim() || "");
  return { text, steps: 1 };
}

/** Proactive motivation dig (cron / manual trigger). */
export async function runMotivationMessage(
  kind: MotivationKind
): Promise<{ text: string; steps: number } | { skipped: true; reason: string }> {
  const settings = await getAgentSettings();
  if (!settings.enabled) return { skipped: true, reason: "disabled" };

  try {
    return await runMotivationGenerate(kind);
  } catch (err) {
    const mapped = mapGeminiError(err);
    if (mapped.message === GEMINI_CREDITS_DEPLETED) {
      return { skipped: true, reason: GEMINI_CREDITS_DEPLETED };
    }
    throw mapped;
  }
}

export type { MotivationKind };
