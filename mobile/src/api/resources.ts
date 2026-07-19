import { apiFetch, type ApiConfig } from "./client";
import type {
  Commitment,
  ContentEntry,
  Goal,
  Habit,
  Project,
  Relationship,
  Task,
  TimelineEvent,
  TimelineEventLink,
} from "@/lib/types";
import type { LifePeriod } from "@/lib/life-periods";

export type HomePayload = {
  habits: Habit[];
  activeGoals: Goal[];
  doneGoalsCount: number;
  pendingCommitments: Commitment[];
  relationships: Pick<
    Relationship,
    "id" | "name" | "last_contact_date" | "reminder_days" | "phone" | "email"
  >[];
  recentEvents: TimelineEvent[];
  eventsMode: "upcoming" | "recent";
  openTasks: Task[];
  projects: Project[];
  libraryEntries: Pick<ContentEntry, "id" | "title" | "category" | "tags" | "body" | "updated_at">[];
  openTasksCount: number;
  inProgressTasksCount: number;
};

export type GoogleTasksStatusPayload = {
  connected: boolean;
  syncStatus?: "idle" | "running" | "completed" | "failed";
  lastSyncAt?: string | null;
  taskCount?: number;
  selected_list_ids?: string[];
};

export type MondayAccount = {
  account_key: string;
  account_name: string;
  account_slug: string | null;
  connected: boolean;
  last_sync_at?: string | null;
  sync_status?: "idle" | "running" | "completed" | "failed";
  selected_list_ids?: string[];
};

export type SyncStatusPayload = {
  connected: boolean;
  syncStatus?: "idle" | "running" | "completed" | "failed";
  syncProgress?: { total: number; processed: number } | null;
  lastSyncAt?: string | null;
  eventCount?: number;
};

export const api = {
  checkSession: (c: ApiConfig) => apiFetch<{ ok: boolean }>(c, "/session"),
  home: (c: ApiConfig) => apiFetch<HomePayload>(c, "/home"),

  projects: (c: ApiConfig) => apiFetch<Project[]>(c, "/projects"),
  createProject: (c: ApiConfig, body: { name: string }) =>
    apiFetch<Project>(c, "/projects", { method: "POST", body }),
  renameProject: (c: ApiConfig, id: string, name: string) =>
    apiFetch<Project>(c, `/projects/${id}`, { method: "PATCH", body: { name } }),
  deleteProject: (c: ApiConfig, id: string) =>
    apiFetch<{ ok: boolean }>(c, `/projects/${id}`, { method: "DELETE" }),

  tasks: (
    c: ApiConfig,
    params?: { project?: string; status?: string; priority?: string; source?: string; external_list?: string }
  ) => {
    const sp = new URLSearchParams();
    if (params?.project) sp.set("project", params.project);
    if (params?.status) sp.set("status", params.status);
    if (params?.priority) sp.set("priority", params.priority);
    if (params?.source) sp.set("source", params.source);
    if (params?.external_list) sp.set("external_list", params.external_list);
    const qs = sp.toString();
    return apiFetch<Task[]>(c, `/tasks${qs ? `?${qs}` : ""}`);
  },
  createTask: (c: ApiConfig, body: Partial<Task>) =>
    apiFetch<Task>(c, "/tasks", { method: "POST", body }),
  updateTask: (c: ApiConfig, id: string, body: Partial<Task>) =>
    apiFetch<Task>(c, `/tasks/${id}`, { method: "PATCH", body }),
  deleteTask: (c: ApiConfig, id: string) =>
    apiFetch<{ ok: boolean }>(c, `/tasks/${id}`, { method: "DELETE" }),

  habits: (c: ApiConfig) => apiFetch<Habit[]>(c, "/habits"),
  createHabit: (c: ApiConfig, body: Partial<Habit>) =>
    apiFetch<Habit>(c, "/habits", { method: "POST", body }),
  updateHabit: (c: ApiConfig, id: string, body: Partial<Habit>) =>
    apiFetch<Habit>(c, `/habits/${id}`, { method: "PATCH", body }),
  deleteHabit: (c: ApiConfig, id: string) =>
    apiFetch<{ ok: boolean }>(c, `/habits/${id}`, { method: "DELETE" }),
  reportHabit: (c: ApiConfig, id: string, type: "check_in" | "fall" | "reset") =>
    apiFetch<Habit>(c, `/habits/${id}/report`, { method: "POST", body: { type } }),

  goals: (c: ApiConfig) => apiFetch<Goal[]>(c, "/goals"),
  createGoal: (c: ApiConfig, body: Partial<Goal>) =>
    apiFetch<Goal>(c, "/goals", { method: "POST", body }),
  updateGoal: (c: ApiConfig, id: string, body: Partial<Goal> & { toggle_status?: boolean }) =>
    apiFetch<Goal>(c, `/goals/${id}`, { method: "PATCH", body }),
  deleteGoal: (c: ApiConfig, id: string) =>
    apiFetch<{ ok: boolean }>(c, `/goals/${id}`, { method: "DELETE" }),

  commitments: (c: ApiConfig) => apiFetch<Commitment[]>(c, "/commitments"),
  createCommitment: (c: ApiConfig, body: { text: string; commitment_date?: string }) =>
    apiFetch<Commitment>(c, "/commitments", { method: "POST", body }),
  setCommitmentStatus: (c: ApiConfig, id: string, status: Commitment["status"]) =>
    apiFetch<Commitment>(c, `/commitments/${id}`, { method: "PATCH", body: { status } }),
  deleteCommitment: (c: ApiConfig, id: string) =>
    apiFetch<{ ok: boolean }>(c, `/commitments/${id}`, { method: "DELETE" }),

  relationships: (c: ApiConfig) => apiFetch<Relationship[]>(c, "/relationships"),
  createRelationship: (c: ApiConfig, body: Partial<Relationship>) =>
    apiFetch<Relationship>(c, "/relationships", { method: "POST", body }),
  updateRelationship: (c: ApiConfig, id: string, body: Partial<Relationship>) =>
    apiFetch<Relationship>(c, `/relationships/${id}`, { method: "PATCH", body }),
  deleteRelationship: (c: ApiConfig, id: string) =>
    apiFetch<{ ok: boolean }>(c, `/relationships/${id}`, { method: "DELETE" }),

  library: (c: ApiConfig, params?: { q?: string; category?: string }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.category) sp.set("category", params.category);
    const qs = sp.toString();
    return apiFetch<ContentEntry[]>(c, `/library${qs ? `?${qs}` : ""}`);
  },
  createEntry: (c: ApiConfig, body: Partial<Omit<ContentEntry, "tags">> & { tags?: string | string[] }) =>
    apiFetch<ContentEntry>(c, "/library", { method: "POST", body }),
  updateEntry: (
    c: ApiConfig,
    id: string,
    body: Partial<Omit<ContentEntry, "tags">> & { tags?: string | string[] }
  ) => apiFetch<ContentEntry>(c, `/library/${id}`, { method: "PATCH", body }),
  deleteEntry: (c: ApiConfig, id: string) =>
    apiFetch<{ ok: boolean }>(c, `/library/${id}`, { method: "DELETE" }),

  timelineEvents: (c: ApiConfig) => apiFetch<TimelineEvent[]>(c, "/timeline/events"),
  createEvent: (c: ApiConfig, body: Partial<TimelineEvent>) =>
    apiFetch<TimelineEvent>(c, "/timeline/events", { method: "POST", body }),
  updateEvent: (c: ApiConfig, id: string, body: Partial<TimelineEvent>) =>
    apiFetch<TimelineEvent>(c, `/timeline/events/${id}`, { method: "PATCH", body }),
  deleteEvent: (c: ApiConfig, id: string) =>
    apiFetch<{ ok: boolean; hidden?: boolean }>(c, `/timeline/events/${id}`, {
      method: "DELETE",
    }),

  eventLinks: (c: ApiConfig, eventId: string) =>
    apiFetch<TimelineEventLink[]>(c, `/timeline/events/${eventId}/links`),
  createEventLink: (
    c: ApiConfig,
    eventId: string,
    body: { kind: TimelineEventLink["kind"]; url?: string | null; content?: string | null }
  ) => apiFetch<TimelineEventLink>(c, `/timeline/events/${eventId}/links`, { method: "POST", body }),
  deleteEventLink: (c: ApiConfig, linkId: string) =>
    apiFetch<{ ok: boolean }>(c, `/timeline/links/${linkId}`, { method: "DELETE" }),

  periods: (c: ApiConfig) => apiFetch<LifePeriod[]>(c, "/timeline/periods"),
  createPeriod: (c: ApiConfig, body: Partial<LifePeriod>) =>
    apiFetch<LifePeriod>(c, "/timeline/periods", { method: "POST", body }),
  updatePeriod: (c: ApiConfig, id: string, body: Partial<LifePeriod>) =>
    apiFetch<LifePeriod>(c, `/timeline/periods/${id}`, { method: "PATCH", body }),
  deletePeriod: (c: ApiConfig, id: string) =>
    apiFetch<{ ok: boolean }>(c, `/timeline/periods/${id}`, { method: "DELETE" }),

  syncStatus: (c: ApiConfig) => apiFetch<SyncStatusPayload>(c, "/sync/status"),
  runSync: (c: ApiConfig) =>
    apiFetch<{ ok: boolean; imported?: number; removed?: number; alreadyRunning?: boolean }>(
      c,
      "/sync",
      { method: "POST", body: {} }
    ),

  googleTasksStatus: (c: ApiConfig) => apiFetch<GoogleTasksStatusPayload>(c, "/integrations/google-tasks/status"),
  googleTasksLists: (c: ApiConfig) => apiFetch<{ id: string; title: string }[]>(c, "/integrations/google-tasks/lists"),
  patchGoogleTasksSettings: (c: ApiConfig, body: { selected_list_ids: string[] }) =>
    apiFetch(c, "/integrations/google-tasks/settings", { method: "PATCH", body }),
  disconnectGoogleTasks: (c: ApiConfig) =>
    apiFetch(c, "/integrations/google-tasks/disconnect", { method: "POST", body: {} }),
  syncTaskSources: (c: ApiConfig, provider?: string) =>
    apiFetch(c, "/integrations/task-sources/sync", {
      method: "POST",
      body: provider ? { provider } : {},
    }),

  mondayAccounts: (c: ApiConfig) =>
    apiFetch<{ accounts: MondayAccount[] }>(c, "/integrations/monday/accounts"),
  mondayBoards: (c: ApiConfig, accountKey: string) =>
    apiFetch<{ id: string; title: string }[]>(
      c,
      `/integrations/monday/boards?account_key=${encodeURIComponent(accountKey)}`
    ),
  patchMondaySettings: (
    c: ApiConfig,
    body: { account_key: string; selected_list_ids: string[] }
  ) => apiFetch(c, "/integrations/monday/settings", { method: "PATCH", body }),
  disconnectMonday: (c: ApiConfig, body: { account_key: string }) =>
    apiFetch(c, "/integrations/monday/disconnect", { method: "POST", body }),
};
