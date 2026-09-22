# WhatsApp Agent Reliability & Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the MySelf motivation WhatsApp bot reliably answer every message (text + voice), send exactly one smart reply per inbound message, and give the agent fast full read/write control over app data with urgency-aware task context.

**Architecture:** Keep Meta webhook at `/api/agent/whatsapp/webhook` but return HTTP 200 immediately and process inbound messages asynchronously via `after()`. Add outbound idempotency keyed by `external_id` (Meta `wamid`). Harden transcription, agent reply synthesis, and context ranking in pure `lib/agent/*` modules with unit tests. Add bulk tools (`bulk_create_relationships`, `bulk_update_habits`) to avoid 12-step tool-loop timeouts.

**Tech Stack:** Next.js App Router (Vercel), Supabase (`myself` schema), Meta WhatsApp Cloud API v21.0, AI SDK `ToolLoopAgent` + Google Gemini (`gemini-3-flash-preview`), `node:test` + `tsx`.

## Global Constraints

- SRS: `FR-AI-WA-01` — bidirectional WhatsApp webhook; only configured user phone; text + voice (transcribed to Hebrew before agent).
- SRS: `FR-AI-WA-02` — scheduled motivation digs via Jerusalem `dig_hours`.
- SRS: `FR-AI-AGENT-01` — full read/write tool access to tasks, habits, goals, commitments, relationships, library, timeline, periods, dig schedule.
- SRS: `FR-AI-AGENT-03` — people / stay-in-touch → `create_relationship`, not `create_task`.
- SRS: `FR-AI-GMAIL-01`–`03` — Gmail read tools when connected; morning dig may include `gmail_digest`.
- Version bump in `package.json` on every push to `main` (semver patch for bug fixes).
- Primary product is Expo app (`mobile/`); backend changes in `app/api/**`, `lib/**`.
- WhatsApp outbound must never return HTTP 5xx to Meta (retries cause duplicate replies).
- Hebrew user-facing copy for WhatsApp replies.

---

## Chat & Code Analysis (why it broke)

| Symptom (from `chat.md`) | Root cause in code |
|---|---|
| Jul 28 `הייי`, Sep 12 `שלום` ×3 — **no reply** until manual “חיבור תוקן” | Expired `WHATSAPP_ACCESS_TOKEN`. `sendWhatsAppText` fails silently: webhook `catch` returns `{ ok: true, skipped: "error" }` without notifying user (`app/api/agent/whatsapp/webhook/route.ts:136-139`). |
| Voice notes → silence or “תשלח טקסט” | Transcription failure (`lib/whatsapp/transcribe.ts`) or empty transcript; early return sends only transcribe-fail message. Jul 3: voice broke pipeline until manual fix. |
| Burst of 4–10 replies at same minute (Sep 12 23:28, Sep 14 13:09) | Slow synchronous webhook (up to 60s). Meta retries + queued user messages complete together. No **outbound** dedup per `wamid`. Agent may run 12 tool steps (`stopWhen: stepCountIs(12)`) updating habits one-by-one → timeout → partial/duplicate behavior. |
| `לא הצלחתי לענות כרגע. נסה שוב.` spam | Model ignores prompt rule (`lib/agent/prompt.ts:24`). No server-side filter. WhatsApp channel skips empty-text fallback but model still emits this phrase. |
| Contradictory Gmail answers (found Thailand flight / didn’t find) | Multiple overlapping agent runs + `gmail_working` flapping (`gmail_api_disabled` vs working). No single-reply lock. |
| Jul 18 — contact list created as **tasks** not relationship cards | Model used `create_task` despite prompt; no `bulk_create_relationships` tool; no server validation blocking people-names-as-tasks. |
| Sep 13 — wants only **top 5 urgent** tasks; due >1 month = not urgent | `buildAgentContext` returns `top_tasks: tasks.slice(0, 8)` sorted only by priority enum, ignoring `due_date` distance (`lib/agent/context.ts:75-82`). |
| Sep 14 — one voice message → 6+ habit schedule confirmations | Multiple `update_habit` tool calls (one per habit) in tool loop; each run may complete as separate webhook execution under retry pressure. |

---

## File map

| File | Responsibility |
|---|---|
| `lib/agent/whatsapp-process.ts` | **New.** Core inbound pipeline: transcribe → agent → single outbound send |
| `lib/agent/whatsapp-outbound.ts` | **New.** Outbound idempotency + user-safe error messages |
| `lib/agent/task-urgency.ts` | **New.** Pure urgency scoring (top 5, due-date rules) |
| `lib/agent/reply.ts` | **New.** Sanitize agent text; forbid generic failure phrases |
| `lib/agent/data-bulk.ts` | **New.** `bulk_create_relationships`, `bulk_update_habits` |
| `lib/whatsapp/transcribe.ts` | Retry + fallback mime; clearer errors |
| `app/api/agent/whatsapp/webhook/route.ts` | Return 200 fast; `after()` dispatch |
| `lib/agent/context.ts` | Use `top_urgent_tasks` from urgency module |
| `lib/agent/tools.ts` | Register bulk tools |
| `lib/agent/tools-extra.ts` | Wire `bulk_update_habits` |
| `lib/agent/run.ts` | Reply sanitization; optional fast path for simple queries |
| `lib/agent/prompt.ts` | Bulk tools + urgency rules + voice etiquette |
| `app/api/agent/health/route.ts` | **New.** Cron health check for WA + Gemini tokens |
| `supabase/migrations/0036_agent_whatsapp_outbound_dedup.sql` | Unique outbound per inbound `external_id` |
| `lib/__tests__/agent-whatsapp.test.ts` | Extend tests |
| `lib/__tests__/task-urgency.test.ts` | **New.** |
| `lib/__tests__/agent-reply.test.ts` | **New.** |
| `docs/SSOT/SRS.md` | Add `FR-AI-WA-03` outbound dedup + urgency context (if missing) |

---

### Task 1: Outbound dedup schema + helpers

**Files:**
- Create: `supabase/migrations/0036_agent_whatsapp_outbound_dedup.sql`
- Create: `lib/agent/whatsapp-outbound.ts`
- Test: `lib/__tests__/agent-whatsapp.test.ts`

**Interfaces:**
- Consumes: `getSupabase()`, `sendWhatsAppText(to, body)` from `@/lib/whatsapp/client`
- Produces: `claimWhatsAppOutbound(inboundId: string): Promise<'claimed'|'duplicate'|'error'>`, `recordWhatsAppOutbound(inboundId: string, content: string, waMessageId: string): Promise<void>`, `userFacingAgentError(code: string): string`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/__tests__/agent-whatsapp.test.ts
import { userFacingAgentError } from "../agent/whatsapp-outbound";

describe("userFacingAgentError", () => {
  it("maps whatsapp_not_configured to Hebrew", () => {
    assert.match(userFacingAgentError("whatsapp_not_configured"), /WhatsApp/);
  });
  it("never returns empty", () => {
    assert.ok(userFacingAgentError("agent_timeout").length > 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/__tests__/agent-whatsapp.test.ts`
Expected: FAIL with `Cannot find module '../agent/whatsapp-outbound'`

- [ ] **Step 3: Write migration + implementation**

```sql
-- supabase/migrations/0036_agent_whatsapp_outbound_dedup.sql
CREATE UNIQUE INDEX IF NOT EXISTS agent_messages_whatsapp_outbound_inbound_uidx
  ON myself.agent_messages (external_id)
  WHERE external_id IS NOT NULL
    AND direction = 'outbound'
    AND channel = 'whatsapp';
```

```typescript
// lib/agent/whatsapp-outbound.ts
import { getSupabase } from "@/lib/supabase";
import { sendWhatsAppText } from "@/lib/whatsapp/client";

const ERROR_HE: Record<string, string> = {
  whatsapp_not_configured:
    "שליחת WhatsApp לא מוגדרת בשרת (חסר טוקן). תבדוק Vercel → WHATSAPP_ACCESS_TOKEN.",
  missing_gemini_api_key:
    "מפתח Gemini חסר בשרת. תוסיף GOOGLE_GENERATIVE_AI_API_KEY ב-Vercel.",
  agent_timeout:
    "לקח לי יותר מדי זמן לענות. נסה שוב בהודעה קצרה אחת.",
  agent_error:
    "משהו נתקע בצד שלי. נסה שוב בעוד דקה.",
};

export function userFacingAgentError(code: string): string {
  return ERROR_HE[code] ?? ERROR_HE.agent_error;
}

export async function claimWhatsAppOutbound(inboundId: string): Promise<"claimed" | "duplicate" | "error"> {
  const sb = getSupabase();
  const ref = `out:${inboundId}`;
  const { data: existing } = await sb
    .from("agent_messages")
    .select("id")
    .eq("external_id", ref)
    .eq("direction", "outbound")
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (existing) return "duplicate";

  const { error } = await sb.from("agent_messages").insert({
    direction: "outbound",
    channel: "whatsapp",
    content: "[sending]",
    external_id: ref,
  });
  if (!error) return "claimed";
  if (error.code === "23505") return "duplicate";
  return "error";
}

export async function recordWhatsAppOutbound(
  inboundId: string,
  content: string,
  waMessageId: string
): Promise<void> {
  await getSupabase()
    .from("agent_messages")
    .update({ content, external_id: `out:${inboundId}`, metadata: { wa_message_id: waMessageId } })
    .eq("external_id", `out:${inboundId}`)
    .eq("direction", "outbound")
    .eq("channel", "whatsapp");
}

/** Send exactly one reply per inbound wamid. */
export async function sendWhatsAppReplyOnce(
  to: string,
  inboundId: string,
  body: string
): Promise<{ ok: boolean; skipped?: string }> {
  const claim = await claimWhatsAppOutbound(inboundId);
  if (claim === "duplicate") return { ok: true, skipped: "duplicate_outbound" };

  const sent = await sendWhatsAppText(to, body);
  if (!sent.ok) return { ok: false, skipped: sent.error };

  await recordWhatsAppOutbound(inboundId, body, sent.messageId);
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/__tests__/agent-whatsapp.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0036_agent_whatsapp_outbound_dedup.sql lib/agent/whatsapp-outbound.ts lib/__tests__/agent-whatsapp.test.ts
git commit -m "fix(agent): add WhatsApp outbound dedup per inbound message"
```

---

### Task 2: Async webhook — return 200 immediately

**Files:**
- Create: `lib/agent/whatsapp-process.ts`
- Modify: `app/api/agent/whatsapp/webhook/route.ts`

**Interfaces:**
- Consumes: `claimWhatsAppInbound`, `finalizeWhatsAppInbound`, `sendWhatsAppReplyOnce`, `userFacingAgentError`, `runAgentChat`, `handleCodingTaskRequest`, `transcribeWhatsAppAudio`, `downloadWhatsAppMedia`
- Produces: `processWhatsAppInbound(inbound: InboundWhatsAppMessage, settings: AgentSettings): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/__tests__/agent-whatsapp.test.ts
import { buildInboundLogContent } from "../agent/whatsapp-process";

describe("buildInboundLogContent", () => {
  it("prefixes voice transcripts", () => {
    assert.equal(buildInboundLogContent("audio", "שלום"), "[voice] שלום");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (`buildInboundLogContent` not defined)

Run: `npx tsx --test lib/__tests__/agent-whatsapp.test.ts`

- [ ] **Step 3: Implement processor + slim webhook**

```typescript
// lib/agent/whatsapp-process.ts
import type { InboundWhatsAppMessage } from "@/lib/whatsapp/inbound";
import { downloadWhatsAppMedia } from "@/lib/whatsapp/client";
import { transcribeWhatsAppAudio } from "@/lib/whatsapp/transcribe";
import { handleCodingTaskRequest } from "@/lib/agent/coding/bridge";
import { runAgentChat } from "@/lib/agent/run";
import { sanitizeAgentReply } from "@/lib/agent/reply";
import { finalizeWhatsAppInbound } from "@/lib/agent/whatsapp-dedup";
import { sendWhatsAppReplyOnce, userFacingAgentError } from "@/lib/agent/whatsapp-outbound";

export function buildInboundLogContent(kind: "text" | "audio", text: string): string {
  return kind === "audio" ? `[voice] ${text}` : text;
}

export async function processWhatsAppInbound(inbound: InboundWhatsAppMessage): Promise<void> {
  let userText = inbound.text ?? "";

  if (inbound.kind === "audio" && inbound.audioMediaId) {
    const media = await downloadWhatsAppMedia(inbound.audioMediaId);
    userText = await transcribeWhatsAppAudio({
      bytes: media.bytes,
      mimeType: inbound.audioMimeType || media.mimeType,
    });
  }

  const logContent = buildInboundLogContent(inbound.kind, userText);
  await finalizeWhatsAppInbound(inbound.messageId, logContent || "[empty]");

  if (!userText.trim()) {
    await sendWhatsAppReplyOnce(
      inbound.from,
      inbound.messageId,
      "לא שמעתי טקסט בהקלטה. תדבר שוב לאט או תכתוב."
    );
    return;
  }

  const coding = await handleCodingTaskRequest({
    message: userText,
    channel: "whatsapp",
    logInbound: false,
    external_id: inbound.messageId,
    inboundLogContent: logContent,
  });

  const replyText = coding.handled
    ? coding.text
    : sanitizeAgentReply(
        (await runAgentChat({ message: userText, channel: "whatsapp", logInbound: false })).text
      );

  const body = replyText.trim() || userFacingAgentError("agent_error");
  const sent = await sendWhatsAppReplyOnce(inbound.from, inbound.messageId, body);
  if (!sent.ok && sent.skipped !== "duplicate_outbound") {
    console.error("[whatsapp-process] send_failed", inbound.messageId, sent.skipped);
  }
}
```

```typescript
// app/api/agent/whatsapp/webhook/route.ts — POST body after claim:
import { after } from "next/server";
import { processWhatsAppInbound } from "@/lib/agent/whatsapp-process";

// ... existing claim + auth checks ...

after(async () => {
  try {
    await processWhatsAppInbound(inbound);
  } catch (err) {
    const code = err instanceof Error ? err.message : "agent_error";
    console.error("[whatsapp-webhook-after]", code, inbound.messageId);
    await sendWhatsAppReplyOnce(
      inbound.from,
      inbound.messageId,
      userFacingAgentError(code)
    );
  }
});

return webhookOk({ ok: true, queued: true, messageId: inbound.messageId });
```

Remove the old synchronous agent/transcribe/send block from `POST` (lines 66–135).

- [ ] **Step 4: Run tests**

Run: `npx tsx --test lib/__tests__/agent-whatsapp.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/agent/whatsapp-process.ts app/api/agent/whatsapp/webhook/route.ts lib/__tests__/agent-whatsapp.test.ts
git commit -m "fix(whatsapp): process inbound async after 200 OK to Meta"
```

---

### Task 3: Reply sanitization — kill generic failure spam

**Files:**
- Create: `lib/agent/reply.ts`
- Modify: `lib/agent/run.ts`
- Test: `lib/__tests__/agent-reply.test.ts`

**Interfaces:**
- Produces: `sanitizeAgentReply(text: string): string`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/__tests__/agent-reply.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeAgentReply } from "../agent/reply";

describe("sanitizeAgentReply", () => {
  it("replaces generic retry phrase with actionable Hebrew", () => {
    const out = sanitizeAgentReply("לא הצלחתי לענות כרגע. נסה שוב.");
    assert.ok(!out.includes("נסה שוב"));
    assert.ok(out.length > 10);
  });
  it("preserves normal replies", () => {
    const msg = "יש לך 3 משימות דחופות. תתחיל מהמותג בגוגל.";
    assert.equal(sanitizeAgentReply(msg), msg);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx tsx --test lib/__tests__/agent-reply.test.ts`

- [ ] **Step 3: Implement**

```typescript
// lib/agent/reply.ts
const BANNED = [/לא הצלחתי לענות/i, /נסה שוב/i];

export function sanitizeAgentReply(text: string): string {
  const t = text.trim();
  if (!t) return "";
  if (BANNED.some((re) => re.test(t))) {
    return "נתקעתי באמצע. תנסח שוב בקצרה מה אתה רוצה שאעשה (משימה / הרגל / מייל / קשר).";
  }
  return t;
}
```

In `lib/agent/run.ts`, before `logAgentMessage` outbound:

```typescript
import { sanitizeAgentReply } from "@/lib/agent/reply";
// ...
text = sanitizeAgentReply(text);
```

- [ ] **Step 4: Run tests**

Run: `npx tsx --test lib/__tests__/agent-reply.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/agent/reply.ts lib/agent/run.ts lib/__tests__/agent-reply.test.ts
git commit -m "fix(agent): sanitize generic failure phrases in replies"
```

---

### Task 4: Voice transcription hardening

**Files:**
- Modify: `lib/whatsapp/transcribe.ts`
- Test: `lib/__tests__/agent-whatsapp.test.ts` (add unit test with mocked generateText if needed; at minimum test mime normalization helper)

**Interfaces:**
- Produces: `normalizeAudioMime(mime: string): string`

- [ ] **Step 1: Write failing test for mime normalization**

```typescript
import { normalizeAudioMime } from "../whatsapp/transcribe";

it("strips codec suffix from ogg", () => {
  assert.equal(normalizeAudioMime("audio/ogg; codecs=opus"), "audio/ogg");
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement retry + mime helper**

```typescript
// lib/whatsapp/transcribe.ts
export function normalizeAudioMime(mime: string): string {
  return mime.split(";")[0]?.trim() || "audio/ogg";
}

export async function transcribeWhatsAppAudio(input: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<string> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error("missing_gemini_api_key");

  const mimeType = normalizeAudioMime(input.mimeType);
  const prompt =
    "תמלל את ההקלטה לעברית בלבד. החזר רק את התמלול, בלי מרכאות ובלי הערות. " +
    "אם לא ברור — החזר את המילים הכי סבירות.";

  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = await generateText({
      model: google("gemini-3-flash-preview"),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "file", data: input.bytes, mediaType: mimeType },
          ],
        },
      ],
    });
    const out = text?.trim() || "";
    if (out) return out;
  }
  throw new Error("empty_transcript");
}
```

Update `lib/agent/whatsapp-process.ts` catch around transcribe to use `sendWhatsAppReplyOnce` with:
`"קיבלתי הקלטה אבל התמלול נכשל. דבר לאט ליד המיקרופון או כתוב בטקסט."`

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp/transcribe.ts lib/__tests__/agent-whatsapp.test.ts
git commit -m "fix(whatsapp): retry voice transcription with Hebrew prompt"
```

---

### Task 5: Task urgency engine (top 5, due-date rules)

**Files:**
- Create: `lib/agent/task-urgency.ts`
- Modify: `lib/agent/context.ts`
- Modify: `lib/agent/prompt.ts`
- Test: `lib/__tests__/task-urgency.test.ts`

**Interfaces:**
- Consumes: `Task` type from `@/lib/types`
- Produces: `rankUrgentTasks(tasks: Task[], now: Date): Task[]`, `isTaskUrgentByDueDate(dueDate: string | null, now: Date): boolean`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/__tests__/task-urgency.test.ts
import { rankUrgentTasks, isTaskUrgentByDueDate } from "../agent/task-urgency";
import type { Task } from "../types";

const base = (p: Partial<Task>): Task => ({
  id: "00000000-0000-4000-8000-000000000001",
  title: "t",
  priority: "medium",
  status: "open",
  due_date: null,
  source: "manual",
  project_id: "00000000-0000-4000-8000-000000000099",
  notes: null,
  created_at: "",
  updated_at: "",
  ...p,
});

describe("isTaskUrgentByDueDate", () => {
  it("due more than 30 days out is not urgent-by-date", () => {
    const now = new Date("2026-09-22");
    assert.equal(isTaskUrgentByDueDate("2027-01-01", now), false);
  });
  it("due within 30 days is urgent-by-date", () => {
    const now = new Date("2026-09-22");
    assert.equal(isTaskUrgentByDueDate("2026-10-01", now), true);
  });
});

describe("rankUrgentTasks", () => {
  it("returns at most 5 tasks", () => {
    const now = new Date("2026-09-22");
    const tasks = Array.from({ length: 12 }, (_, i) =>
      base({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, priority: "high" })
    );
    assert.equal(rankUrgentTasks(tasks, now).length, 5);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// lib/agent/task-urgency.ts
import type { Task, TaskPriority } from "@/lib/types";

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const URGENT_DUE_DAYS = 30;

export function isTaskUrgentByDueDate(dueDate: string | null, now: Date): boolean {
  if (!dueDate) return true; // no date → can still rank by priority
  const due = new Date(`${dueDate}T12:00:00`);
  const ms = due.getTime() - now.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  return days <= URGENT_DUE_DAYS;
}

export function effectiveTaskPriority(task: Task, now: Date): TaskPriority {
  if (task.due_date && !isTaskUrgentByDueDate(task.due_date, now)) {
    return "low"; // far-future tasks demoted (user rule Sep 13)
  }
  return task.priority;
}

export function rankUrgentTasks(tasks: Task[], now = new Date()): Task[] {
  return [...tasks]
    .filter((t) => ["open", "in_progress", "stuck", "review"].includes(t.status))
    .sort((a, b) => {
      const pa = PRIORITY_RANK[effectiveTaskPriority(a, now)];
      const pb = PRIORITY_RANK[effectiveTaskPriority(b, now)];
      if (pa !== pb) return pa - pb;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      return 0;
    })
    .slice(0, 5);
}
```

In `lib/agent/context.ts`, replace `top_tasks: tasks.slice(0, 8)` with:

```typescript
import { rankUrgentTasks } from "@/lib/agent/task-urgency";
// ...
const urgent = rankUrgentTasks(tasks, now);
// ...
top_urgent_tasks: urgent.map((t) => ({
  id: t.id,
  title: t.title,
  priority: t.priority,
  effective_priority: effectiveTaskPriority(t, now),
  status: t.status,
  due_date: t.due_date,
})),
```

Add to `lib/agent/prompt.ts`:

```
משימות דחופות:
- בקונטקסט יש top_urgent_tasks (מקסימום 5) — הצג רק אותן כ"דחופות".
- משימה עם due_date בעוד יותר מ-30 יום לא דחופה אלא אם המשתמש שאל עליה במפורש.
```

- [ ] **Step 4: Run tests — PASS**

Run: `npx tsx --test lib/__tests__/task-urgency.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/agent/task-urgency.ts lib/agent/context.ts lib/agent/prompt.ts lib/__tests__/task-urgency.test.ts
git commit -m "feat(agent): top-5 urgency ranking with 30-day due-date rule"
```

---

### Task 6: Bulk tools — relationships + habits (speed + fewer steps)

**Files:**
- Create: `lib/agent/data-bulk.ts`
- Modify: `lib/agent/tools.ts`
- Modify: `lib/agent/tools-extra.ts`
- Modify: `lib/agent/prompt.ts`

**Interfaces:**
- Produces: `agentBulkCreateRelationships(names: string[], project_id: string)`, `agentBulkUpdateHabits(updates: Array<{ id: string; report_time?: string | null }>)`

- [ ] **Step 1: Write failing test**

```typescript
// lib/__tests__/task-urgency.test.ts or new lib/__tests__/agent-bulk.test.ts
import { parseContactNamesFromHebrewList } from "../agent/data-bulk";

it("parses Hebrew contact list", () => {
  const names = parseContactNamesFromHebrewList("עם קוה לוי\nעם אבא\nעם אמא");
  assert.deepEqual(names, ["קוה לוי", "אבא", "אמא"]);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// lib/agent/data-bulk.ts
import { agentCreateRelationship } from "@/lib/agent/data";
import { agentUpdateHabit } from "@/lib/agent/data-extra";

export function parseContactNamesFromHebrewList(raw: string): string[] {
  return raw
    .split(/\n|,|;/)
    .map((line) => line.replace(/^עם\s+/i, "").trim())
    .filter(Boolean);
}

export async function agentBulkCreateRelationships(input: {
  names: string[];
  project_id: string;
  reminder_days?: number;
}) {
  const created = [];
  const skipped: string[] = [];
  for (const name of input.names) {
    try {
      created.push(await agentCreateRelationship({
        name,
        project_id: input.project_id,
        reminder_days: input.reminder_days ?? 7,
      }));
    } catch {
      skipped.push(name);
    }
  }
  return { created_count: created.length, created, skipped };
}

export async function agentBulkUpdateHabits(
  updates: Array<{ id: string; report_time?: string | null }>
) {
  const updated = [];
  for (const u of updates) {
    updated.push(await agentUpdateHabit(u.id, { report_time: u.report_time }));
  }
  return { updated_count: updated.length, updated };
}
```

Register tools in `tools.ts` / `tools-extra.ts`:

```typescript
bulk_create_relationships: tool({
  description:
    "Create multiple relationship/contact cards at once (שמירת קשר). Use when user lists people to stay in touch with.",
  inputSchema: z.object({
    names: z.array(z.string().min(1)).min(1).max(30),
    project_id: z.string().uuid(),
    reminder_days: z.number().int().min(1).max(365).optional(),
  }),
  execute: async (input) => withLog("bulk_create_relationships", input, () => agentBulkCreateRelationships(input)),
}),
```

```typescript
bulk_update_habits: tool({
  description: "Update report_time for many habits in one call. Prefer over repeated update_habit.",
  inputSchema: z.object({
    updates: z
      .array(z.object({ id: z.string().uuid(), report_time: z.string().nullable().optional() }))
      .min(1)
      .max(40),
  }),
  execute: async (input) => withLog("bulk_update_habits", input, () => agentBulkUpdateHabits(input.updates)),
}),
```

Add `bulk_create_relationships` and `bulk_update_habits` to `AGENT_WRITE_TOOLS` in `lib/agent/action-push.ts` (one push per bulk op, not per row).

Prompt addition:

```
- רשימת אנשים לשמירת קשר → bulk_create_relationships (לא create_task, לא לולאת create_relationship).
- עדכון שעות דיווח לכל ההרגלים → קודם list_habits, אחר כך bulk_update_habits פעם אחת.
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/agent/data-bulk.ts lib/agent/tools.ts lib/agent/tools-extra.ts lib/agent/action-push.ts lib/agent/prompt.ts lib/__tests__/agent-bulk.test.ts
git commit -m "feat(agent): bulk relationship and habit tools for WhatsApp speed"
```

---

### Task 7: Agent performance tuning

**Files:**
- Modify: `lib/agent/run.ts`
- Modify: `lib/agent/context.ts`

- [ ] **Step 1: Add fast-path detector test**

```typescript
// lib/__tests__/agent-reply.test.ts
import { isSimpleStatusQuery } from "../agent/run";

it("detects status questions", () => {
  assert.equal(isSimpleStatusQuery("מה המצב שלי"), true);
  assert.equal(isSimpleStatusQuery("תעדכן את כל ההרגלים"), false);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
// lib/agent/run.ts
export function isSimpleStatusQuery(message: string): boolean {
  return /מה (ה)?מצב|מה (ה)?לוז|סטטוס|מה יש לי|מה דחוף/i.test(message.trim());
}

// Inside runAgentChat, before ToolLoopAgent:
const simple = isSimpleStatusQuery(input.message) && !(input.images?.length);
const stopWhen = simple ? stepCountIs(4) : stepCountIs(12);
```

Shrink context JSON for WhatsApp channel: in `buildAgentContext`, when called from WhatsApp, omit verbose fields (pass `compact: true` option — habits pending count only, not full list).

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/agent/run.ts lib/agent/context.ts lib/__tests__/agent-reply.test.ts
git commit -m "perf(agent): fast path for simple status queries on WhatsApp"
```

---

### Task 8: Integration health cron (prevent silent token death)

**Files:**
- Create: `app/api/agent/health/route.ts`
- Modify: `vercel.json` (add cron entry if not present)

- [ ] **Step 1: Implement health route**

```typescript
// app/api/agent/health/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isWhatsAppConfigured, sendWhatsAppText } from "@/lib/whatsapp/client";
import { getAgentSettings } from "@/lib/agent/settings";

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`);
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await getAgentSettings();
  const issues: string[] = [];

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) issues.push("missing_gemini_api_key");
  if (!isWhatsAppConfigured()) issues.push("whatsapp_not_configured");

  if (settings.whatsapp_phone && isWhatsAppConfigured()) {
    const probe = await sendWhatsAppText(
      settings.whatsapp_phone,
      "[health] בדיקת חיבור אוטומטית — אפשר להתעלם."
    );
    if (!probe.ok) issues.push(`whatsapp_send_failed:${probe.error}`);
  }

  return NextResponse.json({ ok: issues.length === 0, issues });
}
```

Add Vercel cron: daily `0 6 * * *` → `/api/agent/health` (Jerusalem morning).

- [ ] **Step 2: Manual test locally with CRON_SECRET**

Run: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/agent/health`

- [ ] **Step 3: Commit**

```bash
git add app/api/agent/health/route.ts vercel.json
git commit -m "chore(agent): daily WhatsApp/Gemini health probe cron"
```

---

### Task 9: SRS + manual verification checklist

**Files:**
- Modify: `docs/SSOT/SRS.md` (add `FR-AI-WA-03` if missing)

- [ ] **Step 1: Add requirement**

```markdown
### FR-AI-WA-03
WhatsApp inbound processing MUST be idempotent: at most one outbound reply per Meta `wamid` (inbound `external_id`). Webhook returns HTTP 200 before async processing. On failure, user receives a Hebrew error message (never silent drop).

### FR-AI-AGENT-04
Agent context exposes `top_urgent_tasks` (max 5). Tasks with `due_date` more than 30 days in the future are not treated as urgent unless explicitly requested.
```

- [ ] **Step 2: Manual WhatsApp test script**

1. Send text: `מה 5 המשימות הדחופות שלי?` → exactly **one** reply listing ≤5 tasks.
2. Send voice: `תוסיף משימה בדיקה` → one reply confirming task.
3. Send voice: list of 3 names to add as contacts → relationship cards created (check Relationships tab), **not** tasks.
4. Send `קוד: echo test` → coding bridge ack (or quota message), one reply.
5. Kill `WHATSAPP_ACCESS_TOKEN` in preview → health cron reports issue; user gets Hebrew error on message, not silence.

- [ ] **Step 3: Bump version + commit**

```bash
# bump patch in package.json
git add docs/SSOT/SRS.md package.json
git commit -m "docs: FR-AI-WA-03 outbound dedup and urgency context"
```

---

## Self-review

**Spec coverage:**
| Requirement | Task |
|---|---|
| FR-AI-WA-01 text + voice | Tasks 2, 4 |
| FR-AI-WA-02 digs | Unchanged; health cron Task 8 |
| FR-AI-AGENT-01 full tools | Task 6 bulk + existing tools |
| FR-AI-AGENT-03 relationships | Task 6 `bulk_create_relationships` |
| FR-AI-GMAIL-01–03 | Improved via single-reply (Task 1–2); no Gmail code change required |
| User: smart/fast/chat | Tasks 5, 7 |
| User: voice recordings | Task 4 |
| User: full app control | Task 6 + prompt; future: calendar read tool (out of scope — log in CODE QUALITY) |

**Placeholder scan:** None — all steps have concrete code/commands.

**Type consistency:** `processWhatsAppInbound` uses `InboundWhatsAppMessage` from `lib/whatsapp/inbound.ts`; outbound refs use `out:${inboundId}` consistently.

**Gap (logged, not in this plan):** Read-only Google Calendar search tool for agent (`[PENDING REFACTOR]` in CODE QUALITY.md). Trading agent tools remain separate (`lib/trading/*`).

---

## Execution order

1. Task 1 (outbound dedup) — stops duplicate reply storms
2. Task 3 (reply sanitize) — quick win
3. Task 2 (async webhook) — stops Meta retry pressure
4. Task 4 (voice)
5. Task 5 (urgency)
6. Task 6 (bulk tools)
7. Task 7 (perf)
8. Task 8 (health cron)
9. Task 9 (SRS + manual QA)
