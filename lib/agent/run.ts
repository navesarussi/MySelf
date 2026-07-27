import { ToolLoopAgent, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { buildAgentContext, type AgentContextOptions } from "@/lib/agent/context";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { getAgentSettings } from "@/lib/agent/settings";
import { createAgentTools } from "@/lib/agent/tools";
import type { AgentChannel, MotivationKind } from "@/lib/agent/types";
import { logAgentMessage } from "@/lib/agent/log";

const MODEL_ID = "gemini-3-flash-preview";

function requireGeminiKey() {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("missing_gemini_api_key");
  return key;
}

export async function runAgentChat(input: {
  message: string;
  channel: AgentChannel;
  logInbound?: boolean;
  contextOptions?: AgentContextOptions;
}) {
  requireGeminiKey();
  const settings = await getAgentSettings();
  const context = await buildAgentContext(new Date(), input.contextOptions ?? {});
  const tools = createAgentTools();

  if (input.logInbound) {
    await logAgentMessage({
      direction: "inbound",
      channel: input.channel,
      content: input.message,
    });
  }

  const agent = new ToolLoopAgent({
    model: google(MODEL_ID),
    instructions: buildSystemPrompt(settings.tone, context, settings.system_prompt),
    tools,
    stopWhen: stepCountIs(12),
  });

  const result = await agent.generate({ prompt: input.message });
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
