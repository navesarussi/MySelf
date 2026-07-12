export type EventSource = "manual" | "google_calendar";

export type TimelineEvent = {
  id: string;
  event_date: string;
  event_time: string | null;
  title: string;
  description: string | null;
  category: string | null;
  source: EventSource;
  google_event_id: string | null;
  title_override: string | null;
  description_override: string | null;
  hidden_at: string | null;
  synced_at: string | null;
  created_at: string;
};

export type Habit = {
  id: string;
  name: string;
  kind: "build" | "quit";
  target_note: string | null;
  streak_count: number;
  best_streak: number;
  total_success_days: number;
  failure_count: number;
  last_checked_on: string | null;
  archived: boolean;
  created_at: string;
};

export type Goal = {
  id: string;
  title: string;
  category: string | null;
  horizon: string | null;
  first_step: string | null;
  definition_of_done: string | null;
  status: "active" | "done";
  sort_order: number;
  created_at: string;
};

export type Commitment = {
  id: string;
  commitment_date: string;
  text: string;
  status: "pending" | "done" | "missed";
  created_at: string;
};

export type Relationship = {
  id: string;
  name: string;
  group_name: string | null;
  last_contact_date: string | null;
  reminder_days: number | null;
  notes: string | null;
  phone: string | null;
  project_id: string;
  project_name?: string;
  created_at: string;
};

export type SyncStatus = "idle" | "running" | "completed" | "failed";

export type SyncProgress = {
  phase: "fetching" | "upserting" | "cleanup";
  total: number;
  processed: number;
  imported: number;
};

export type IntegrationToken = {
  provider: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  connected_at: string;
  last_sync_at: string | null;
  sync_status: SyncStatus;
  sync_progress: SyncProgress | null;
  sync_started_at: string | null;
};

export type ContentEntry = {
  id: string;
  title: string;
  category: string;
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "open" | "in_progress" | "done";

export type Task = {
  id: string;
  title: string;
  project_id: string;
  project_name?: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
