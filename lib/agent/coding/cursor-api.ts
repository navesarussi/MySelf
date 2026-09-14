import { MYSELF_REPO_URL } from "@/lib/agent/coding/types";

const CURSOR_AGENTS_URL = "https://api.cursor.com/v1/agents";

export type CursorAgentLaunch = {
  agentId: string;
  runId: string;
  agentUrl: string | null;
  status: string;
};

function getCursorApiKey(): string | null {
  const key = process.env.CURSOR_API_KEY?.trim();
  return key || null;
}

export function isCursorCodingConfigured(): boolean {
  return Boolean(getCursorApiKey());
}

function buildAgentPrompt(task: string): string {
  return [
    "Implement the following coding task in the MySelf repository.",
    "",
    "USER TASK:",
    task,
    "",
    "REQUIREMENTS:",
    "- Open a focused PR with only the changes required for this task.",
    "- Bump package.json semver per CLAUDE.md (patch for fixes, minor for features).",
    "- Do NOT push directly to main; rely on autoCreatePR only (no workOnCurrentBranch).",
    "- Do NOT perform unrelated refactors or scope creep.",
    "- Primary product is the Expo app under mobile/; shared backend is app/api/** and lib/**.",
    "- Add the GitHub label `chat-code` to the PR when you open it.",
    "- Legacy Next.js UI under app/legacy/** is out of scope unless the task explicitly asks for it.",
  ].join("\n");
}

export async function launchCursorCodingAgent(task: string): Promise<CursorAgentLaunch> {
  const apiKey = getCursorApiKey();
  if (!apiKey) throw new Error("cursor_api_not_configured");

  const body = {
    prompt: { text: buildAgentPrompt(task) },
    repos: [{ url: MYSELF_REPO_URL, startingRef: "main" }],
    autoCreatePR: true,
    skipReviewerRequest: true,
  };

  const res = await fetch(CURSOR_AGENTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof (payload.error as { message?: string } | undefined)?.message === "string"
        ? (payload.error as { message: string }).message
        : `cursor_api_${res.status}`;
    throw new Error(msg);
  }

  const agent = payload.agent as Record<string, unknown> | undefined;
  const run = payload.run as Record<string, unknown> | undefined;
  const agentId = typeof agent?.id === "string" ? agent.id : "";
  const runId = typeof run?.id === "string" ? run.id : "";
  if (!agentId || !runId) throw new Error("cursor_api_invalid_response");

  return {
    agentId,
    runId,
    agentUrl: typeof agent?.url === "string" ? agent.url : null,
    status: typeof run?.status === "string" ? run.status : "CREATING",
  };
}
