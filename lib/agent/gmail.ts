import {
  getValidGmailAccessToken,
  isGmailConnected,
  listGmailMessages,
  readGmailMessage,
} from "@/lib/integrations/gmail/client";
import { getSupabase } from "@/lib/supabase";
import type { TaskPriority } from "@/lib/types";

export async function agentListEmails(input: { q?: string; limit?: number }) {
  const token = await getValidGmailAccessToken();
  const emails = await listGmailMessages(token, input);
  return { count: emails.length, emails };
}

export async function agentReadEmail(id: string) {
  const token = await getValidGmailAccessToken();
  return readGmailMessage(token, id);
}

export function taskTitleFromEmail(subject: string, from: string, override?: string): string {
  if (override?.trim()) return override.trim().slice(0, 200);
  const subj = subject?.trim() || "(ללא נושא)";
  const fromShort = from.replace(/<[^>]+>/g, "").trim().split("@")[0]?.trim();
  const title = fromShort ? `מייל: ${subj} (${fromShort})` : `מייל: ${subj}`;
  return title.slice(0, 200);
}

/** Unread preview for morning dig context. */
export async function buildGmailDigest() {
  if (!(await isGmailConnected())) return null;
  try {
    const { emails } = await agentListEmails({ q: "is:unread newer_than:2d", limit: 5 });
    return {
      unread_count: emails.length,
      emails: emails.map((e) => ({
        id: e.id,
        from: e.from,
        subject: e.subject,
        date: e.date,
        snippet: e.snippet,
      })),
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function agentCreateTaskFromEmail(input: {
  email_id: string;
  title?: string;
  priority?: TaskPriority;
  due_date?: string | null;
}) {
  const email = await agentReadEmail(input.email_id);
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("source", "gmail")
    .eq("external_id", input.email_id)
    .maybeSingle();
  if (existing) return { already_exists: true, task: existing };

  const title = taskTitleFromEmail(email.subject, email.from, input.title);
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title,
      source: "gmail",
      external_id: input.email_id,
      external_meta: {
        subject: email.subject,
        from: email.from,
        date: email.date,
        snippet: email.snippet,
      },
      priority: input.priority ?? "medium",
      status: "open",
      due_date: input.due_date ?? null,
      notes: email.body.slice(0, 2000) || email.snippet || null,
    })
    .select()
    .single();
  if (error) throw new Error("task_from_email_failed");
  return { created: true, task: data };
}

export { isGmailConnected };
