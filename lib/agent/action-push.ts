import { notifyUser } from "@/lib/push/notify";

/** Agent tools that mutate app data (not read-only). */
export const AGENT_WRITE_TOOLS = new Set([
  "create_task",
  "update_task",
  "create_task_from_email",
  "create_habit",
  "update_habit",
  "report_habit",
  "create_goal",
  "update_goal",
  "create_commitment",
  "update_commitment",
  "create_relationship",
  "update_relationship",
  "touch_relationship",
  "create_library_entry",
  "update_library_entry",
  "create_event",
  "update_event",
  "create_period",
  "update_period",
  "update_dig_schedule",
]);

const ACTION_LABEL: Record<string, string> = {
  create_task: "משימה נוצרה",
  update_task: "משימה עודכנה",
  create_task_from_email: "משימה ממייל",
  create_habit: "הרגל חדש",
  update_habit: "הרגל עודכן",
  report_habit: "דיווח הרגל",
  create_goal: "מטרה חדשה",
  update_goal: "מטרה עודכנה",
  create_commitment: "התחייבות חדשה",
  update_commitment: "התחייבות עודכנה",
  create_relationship: "קשר חדש",
  update_relationship: "קשר עודכן",
  touch_relationship: "שמירת קשר",
  create_library_entry: "תוכן חדש",
  update_library_entry: "תוכן עודכן",
  create_event: "אירוע חדש",
  update_event: "אירוע עודכן",
  create_period: "תקופה חדשה",
  update_period: "תקופה עודכנה",
  update_dig_schedule: "לוח חפירות עודכן",
};

const SCREEN_BY_TOOL: Record<string, string> = {
  create_task: "/tasks",
  update_task: "/tasks",
  create_task_from_email: "/tasks",
  create_habit: "/habits",
  update_habit: "/habits",
  report_habit: "/habits",
  create_goal: "/goals",
  update_goal: "/goals",
  create_commitment: "/",
  update_commitment: "/",
  create_relationship: "/relationships",
  update_relationship: "/relationships",
  touch_relationship: "/relationships",
  create_library_entry: "/library",
  update_library_entry: "/library",
  create_event: "/timeline",
  update_event: "/timeline",
  create_period: "/timeline",
  update_period: "/timeline",
  update_dig_schedule: "/settings",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickLabel(result: unknown): string {
  const root = asRecord(result);
  if (!root) return "";

  const nested = asRecord(root.task) ?? asRecord(root.habit) ?? root;
  const fields = ["title", "name", "text"] as const;
  for (const key of fields) {
    const val = nested[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

export function buildAgentActionPush(toolName: string, toolResult: unknown) {
  const title = ACTION_LABEL[toolName] ?? "פעולת בוט";
  const detail = pickLabel(toolResult);
  const body = detail ? `נווה: ${detail}` : "נווה ביצע שינוי באפליקציה";
  const screen = SCREEN_BY_TOOL[toolName] ?? "/";
  return {
    title,
    body: body.slice(0, 160),
    data: { screen, type: "agent_action", tool: toolName },
  };
}

export function shouldNotifyAgentWrite(toolName: string, toolResult: unknown): boolean {
  if (!AGENT_WRITE_TOOLS.has(toolName)) return false;
  const root = asRecord(toolResult);
  if (root?.error) return false;
  if (toolName === "create_task_from_email" && root?.already_exists) return false;
  return true;
}

/** Fire-and-forget push for a logged agent write. */
export async function notifyAgentActionWrite(
  actionId: string,
  toolName: string,
  toolResult: unknown
): Promise<void> {
  if (!shouldNotifyAgentWrite(toolName, toolResult)) return;

  const payload = buildAgentActionPush(toolName, toolResult);
  await notifyUser("agent", payload, `action:${actionId}`, { bypassQuiet: true });
}
