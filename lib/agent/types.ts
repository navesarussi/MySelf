export type AgentTone = "warm" | "direct" | "humorous";

export type AgentSettings = {
  enabled: boolean;
  whatsapp_phone: string | null;
  morning_hour: number;
  midday_hour: number;
  evening_hour: number;
  /** Jerusalem wall-clock hours for digs (1–6 slots). */
  dig_hours: number[];
  tone: AgentTone;
  system_prompt: string | null;
  updated_at: string;
};

export type AgentChannel = "whatsapp" | "app";
export type MotivationKind = "morning" | "midday" | "evening";
