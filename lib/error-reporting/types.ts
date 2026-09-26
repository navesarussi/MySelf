export type ErrorSource = "server" | "mobile-ios" | "web" | "cron";

export type IntegrationId =
  | "monday"
  | "google"
  | "google_tasks"
  | "github"
  | "cal"
  | "leumi"
  | "supabase"
  | "whatsapp"
  | "gmail"
  | "finance"
  | "trading"
  | "agent"
  | string;

export type ReportContext = {
  route?: string;
  screen?: string;
  method?: string;
  path?: string;
  httpStatus?: number;
  userAction?: string;
  integration?: IntegrationId;
  upstreamBody?: unknown;
  userId?: string;
  appVersion?: string;
  gitSha?: string;
  environment?: string;
  platform?: string;
  test?: boolean;
};

export type ErrorReportPayload = {
  source: ErrorSource;
  appVersion: string;
  gitSha: string | null;
  environment: string;
  route: string | null;
  screen: string | null;
  method: string | null;
  path: string | null;
  httpStatus: number | null;
  userAction: string | null;
  errorName: string;
  message: string;
  stack: string | null;
  integration: string | null;
  upstreamBody: unknown;
  userId: string | null;
  fingerprint: string;
  firstSeen: string;
  occurrenceCount: number;
  timestamp: string;
  test?: boolean;
};

export type ReportErrorInput = {
  source: ErrorSource;
  error: unknown;
  context?: ReportContext;
};

export type DedupeDecision = {
  fingerprint: string;
  shouldSend: boolean;
  occurrenceCount: number;
  firstSeen: string;
  skipReason?: "dedupe_window" | "hourly_cap" | "noise";
};
