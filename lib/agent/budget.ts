import type { AgentChannel } from "@/lib/agent/types";

export type AgentIntent = "ack" | "status" | "full";

export type AgentToolMode = "read" | "full";

/** Compact context shape used for ack templates (from buildAgentContext compact mode). */
export type AckContext = {
  top_urgent_tasks?: Array<{ title?: string }>;
  habits?: { pending_report_count?: number } | { pending_report?: unknown[] };
};

const ACK_ONLY_RE =
  /^(היי|הי|שלום|מה\s*נשמע|מה\s*קורה|בוקר\s*טוב|ערב\s*טוב|צהריים\s*טובים|זמין\??|אתה\s*שם\??|נווה\??|yo|hi|hello)\s*[!.?]*$/i;

const TASK_ASK_RE =
  /משימ|הרגל|מטר|מייל|gmail|email|תזכור|קשר|יציר|עדכן|תוסיף|תמחק|צור|סגור|דחוף|לוז|מצב|סטטוס|מה\s*יש\s*לי|wealth|כסף|הון|cover|ביטוח/i;

/** Hebrew status / snapshot questions — no writes implied. */
export function isSimpleStatusQuery(message: string): boolean {
  return /מה (ה)?מצב|מה (ה)?לוז|סטטוס|מה יש לי|מה דחוף/i.test(message.trim());
}

/** Greetings / ping with no task ask. */
export function isAckQuery(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 40) return false;
  if (TASK_ASK_RE.test(trimmed)) return false;
  return ACK_ONLY_RE.test(trimmed);
}

export function classifyAgentIntent(message: string, hasImages: boolean): AgentIntent {
  if (hasImages) return "full";
  const trimmed = message.trim();
  if (isAckQuery(trimmed)) return "ack";
  if (isSimpleStatusQuery(trimmed)) return "status";
  return "full";
}

/** Short Hebrew ack without Gemini when compact context is enough. */
export function buildAckReply(context: AckContext): string {
  const parts = ["היי, זמין."];
  const urgent = context.top_urgent_tasks?.[0]?.title;
  if (urgent) {
    parts.push(`דחוף: ${urgent}.`);
  } else {
    const habits = context.habits;
    const pending =
      habits && "pending_report_count" in habits
        ? habits.pending_report_count ?? 0
        : habits && "pending_report" in habits
          ? (habits.pending_report?.length ?? 0)
          : 0;
    if (pending > 0) parts.push(`${pending} הרגלים ממתינים לדיווח.`);
  }
  parts.push("מה לעשות?");
  return parts.join(" ");
}

export function toolModeForIntent(intent: AgentIntent, channel: AgentChannel): AgentToolMode {
  if (channel === "whatsapp" && intent === "status") return "read";
  return "full";
}

/** Max agent loop steps by intent (WhatsApp tiers) or legacy app caps. */
export function maxStepsForRun(
  intent: AgentIntent,
  channel: AgentChannel,
  simpleStatusOnApp: boolean
): number {
  if (channel === "app") return simpleStatusOnApp ? 4 : 10;
  switch (intent) {
    case "ack":
      return 1;
    case "status":
      return 2;
    case "full":
      return 6;
  }
}

export function usesTools(intent: AgentIntent, channel: AgentChannel): boolean {
  if (channel === "whatsapp" && intent === "ack") return false;
  return true;
}
