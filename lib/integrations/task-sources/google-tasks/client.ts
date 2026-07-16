import { refreshAccessToken } from "../../google-calendar/client";
import { GOOGLE_TASKS_PROVIDER, GOOGLE_TASKS_SCOPE } from "../../google-config";
import { getIntegrationToken, saveIntegrationToken } from "../../tokens";
import type { GoogleTaskList, GoogleTaskListResponse, GoogleTasksResponse } from "./types";

function googleTasksRedirectUri(): string {
  const origin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  return (
    process.env.GOOGLE_TASKS_REDIRECT_URI ??
    `${origin}/api/integrations/google-tasks/callback`
  );
}

export function googleTasksAuthUrl(state: string): string {
  const redirectUri = googleTasksRedirectUri();

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_TASKS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleTasksCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleTasksRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("token_exchange_failed");
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

export async function fetchTaskLists(accessToken: string): Promise<GoogleTaskList[]> {
  const lists: GoogleTaskList[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://tasks.googleapis.com/tasks/v1/users/@me/lists?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`tasks_lists_fetch_failed:${res.status}:${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as GoogleTaskListResponse;
    if (data.items) lists.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return lists;
}

export async function fetchOpenTasks(accessToken: string, listId: string) {
  const tasks = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      showCompleted: "false",
      showHidden: "false",
      maxResults: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`tasks_fetch_failed:${res.status}:${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as GoogleTasksResponse;
    if (data.items) tasks.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return tasks;
}

export async function completeGoogleTask(
  accessToken: string,
  listId: string,
  taskId: string
): Promise<void> {
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${taskId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "completed" }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`complete_task_failed:${res.status}:${body.slice(0, 500)}`);
  }
}

export async function reopenGoogleTask(
  accessToken: string,
  listId: string,
  taskId: string
): Promise<void> {
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${taskId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "needsAction" }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`reopen_task_failed:${res.status}:${body.slice(0, 500)}`);
  }
}

export async function getValidGoogleTasksAccessToken(): Promise<string> {
  const row = await getIntegrationToken(GOOGLE_TASKS_PROVIDER);
  if (!row) throw new Error("not_connected");

  const expires = new Date(row.expires_at).getTime();
  if (Date.now() < expires - 60_000) return row.access_token;

  const refreshed = await refreshAccessToken(row.refresh_token);
  const expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await saveIntegrationToken({
    provider: GOOGLE_TASKS_PROVIDER,
    access_token: refreshed.access_token,
    refresh_token: row.refresh_token,
    expires_at,
  });
  return refreshed.access_token;
}

export { refreshAccessToken };
