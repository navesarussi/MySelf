export type PushPlatform = "ios" | "android" | "web";

export type NotificationType =
  | "agent"
  | "relationships"
  | "habits"
  | "tasks"
  | "timeline"
  | "test";

export type NotificationPreferences = {
  enabled: boolean;
  agent: boolean;
  relationships: boolean;
  habits: boolean;
  tasks: boolean;
  timeline: boolean;
  quiet_start_hour: number;
  quiet_end_hour: number;
  updated_at: string;
};

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type PushSendResult = {
  sent: number;
  failed: number;
  removedTokens: string[];
};
