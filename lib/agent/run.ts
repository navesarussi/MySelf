import { ToolLoopAgent, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { buildAgentContext, type AgentContextOptions } from "@/lib/agent/context";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { getAgentSettings } from "@/lib/agent/settings";
import { createAgentTools } from "@/lib/agent/tools";
import type { AgentChannel, MotivationKind } from "@/lib/agent/types";
import { logAgentMessage } from "@/lib/agent/log";

const MODEL_ID = "gemini-3-flash-preview";

export type AgentImageInput = {
  mimeType: string;
  data: string;
};

function requireGeminiKey() {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("missing_gemini_api_key");
  return key;
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
  const context = await buildAgentContext(new Date(), input.contextOptions ?? {});
  const tools = createAgentTools();

  const inboundSummary =
    input.images?.length
      ? `${input.message}\n[${input.images.length} image(s) attached]`
      : input.message;

  if (input.logInbound) {
    await logAgentMessage({
      direction: "inbound",
      channel: input.channel,
      content: inboundSummary,
    });
  }

  const agent = new ToolLoopAgent({
    model: google(MODEL_ID),
    instructions: buildSystemPrompt(settings.tone, context, settings.system_prompt),
    tools,
    stopWhen: stepCountIs(12),
  });

  const textPrompt =
    input.message.trim() ||
    "נתח את התמונה/המסמך שהמשתמש שלח ועדכן את האפליקציה עם הכלים המתאימים (במיוחד upsert_wealth_item / import_wealth_text).";

  const userContent: Array<{ type: "text"; text: string } | { type: "image"; image: string; mimeType?: string }> = [
    { type: "text", text: textPrompt },
  ];

  for (const img of input.images ?? []) {
    const dataUrl = img.data.startsWith("data:")
      ? img.data
      : `data:${img.mimeType};base64,${img.data}`;
    userContent.push({ type: "image", image: dataUrl, mimeType: img.mimeType });
  }

  const result =
    input.images?.length
      ? await agent.generate({ messages: [{ role: "user", content: userContent }] })
      : await agent.generate({ prompt: textPrompt });

  const text = result.text?.trim() || "לא הצלחתי לענות כרגע. נסה שוב.";

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

/** Proactive motivation dig (cron / manual trigger). */
export async function runMotivationMessage(
  kind: MotivationKind
): Promise<{ text: string; steps: number } | { skipped: true; reason: string }> {
  const settings = await getAgentSettings();
  if (!settings.enabled) return { skipped: true, reason: "disabled" };

  return runAgentChat({
    message: DIG_PROMPTS[kind],
    channel: "whatsapp",
    logInbound: false,
    contextOptions: { gmailDigest: kind === "morning" },
  });
}

export type { MotivationKind };
