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
import type { FinanceCashflow, FinanceTransaction } from "@/lib/finance/types";
import type { MonthPlanView } from "@/lib/finance/plan";
import type { PlanLineRow } from "@/lib/finance/plan";
import type { FinanceSourcesStatusResponse } from "@/lib/finance/sources-status";
import type { RecurringSuggestion } from "@/lib/finance/recurring";

export type TradingProposalOption = Omit<import("@/lib/trading/trade-finder").ProposalOption, "rating_input">;
export type TradingProposal = { id: string | null; created_at?: string; expires_at?: string; scanned: number; stocks_open: boolean; equity?: number; options: TradingProposalOption[]; errors: string[] };

export type TradingTradeDetail = {
  trade: import("@/lib/trading/store").TradeRow;
  trigger: import("@/lib/trading/service").TriggerRow | null;
  sibling: import("@/lib/trading/service").TradeListItem | null;
  lesson: import("@/lib/trading/store").LessonRow | null;
};

export type TradingBacktestSummary = {
  id: string;
  mode: string;
  years: number;
  symbols: string[];
  param_version: string;
  range_start: string | null;
  range_end: string | null;
  gate: (import("@/lib/trading/gates").BacktestGateInput & { checks: import("@/lib/trading/gates").GateCheck[] }) | null;
  duration_ms: number | null;
  created_at: string;
};

export type TradingBacktestDetail = TradingBacktestSummary & {
  results: import("@/lib/trading/strategy/backtest-v2").V2Result[];
  walk_forward: { folds: { fold: number; start: number; end: number; stats: import("@/lib/trading/metrics").PerformanceStats }[]; oos_expectancy_r: number; passes: boolean } | null;
  skipped: { symbol: string; reason: string }[] | null;
};

export type TradingLearningView = {
  playbook: import("@/lib/trading/store").PlaybookRow | null;
  history: import("@/lib/trading/store").PlaybookRow[];
  lessons: import("@/lib/trading/store").LessonRow[];
};

export type TradingParamSet = {
  id: string;
  version: string;
  params: Record<string, number | string>;
  status: "PROPOSED" | "ACTIVE" | "REJECTED" | "RETIRED";
  evidence: { oos_total_r: number; current_oos_total_r: number; recommend: boolean; steps: { test_fold: number; chosen_version: string; out_of_sample: import("@/lib/trading/metrics").PerformanceStats }[] } | null;
  locked_until: string | null;
  created_at: string;
};

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
  libraryEntries: Pick<ContentEntry, "id" | "title" | "category" | "tags" | "updated_at">[];
  openTasksCount: number;
  inProgressTasksCount: number;
  doneTasksCount: number;
  avgTaskCloseDays: number | null;
  financeUncategorizedCount: number;
  urgentFinance: { id: string; titleOrAmountLabel: string } | null;
  finance?: {
    month: string;
    net_actual: number;
    uncategorized_count: number;
  };
  trading?: {
    phase: string;
    equity: number;
    starting_equity: number;
    kill_switch_active: boolean;
  } | null;
};

export type GoogleTasksStatusPayload = {
  connected: boolean;
  syncStatus?: "idle" | "running" | "completed" | "failed";
  syncProgress?: SyncProgress | null;
  lastSyncAt?: string | null;
  taskCount?: number;
  selected_list_ids?: string[];
};

export type GmailStatusPayload = {
  connected: boolean;
  working: boolean;
  error?: string;
  connectedAt?: string | null;
};

export type SyncProgress = {
  phase: "fetching" | "upserting" | "cleanup";
  total: number;
  processed: number;
  imported: number;
};

export type MondayAccount = {
  account_key: string;
  account_name: string;
  account_slug: string | null;
  connected: boolean;
  last_sync_at?: string | null;
  sync_status?: "idle" | "running" | "completed" | "failed";
  sync_progress?: SyncProgress | null;
  selected_list_ids?: string[];
  task_count?: number;
  task_count_by_board?: Record<string, number>;
};

export type SyncStatusPayload = {
  connected: boolean;
  syncStatus?: "idle" | "running" | "completed" | "failed";
  syncProgress?: SyncProgress | null;
  lastSyncAt?: string | null;
  eventCount?: number;
};

export type TimelineEventsPage = {
  events: TimelineEvent[];
  nextCursor: string | null;
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
    params?: {
      project?: string;
      status?: string;
      priority?: string;
      source?: string;
      external_list?: string;
      q?: string;
      overdue?: boolean;
      sort?: string;
    }
  ) => {
    const sp = new URLSearchParams();
    if (params?.project) sp.set("project", params.project);
    if (params?.status) sp.set("status", params.status);
    if (params?.priority) sp.set("priority", params.priority);
    if (params?.source) sp.set("source", params.source);
    if (params?.external_list) sp.set("external_list", params.external_list);
    if (params?.q) sp.set("q", params.q);
    if (params?.overdue) sp.set("overdue", "1");
    if (params?.sort) sp.set("sort", params.sort);
    const qs = sp.toString();
    return apiFetch<Task[]>(c, `/tasks${qs ? `?${qs}` : ""}`);
  },
  createTask: (c: ApiConfig, body: Partial<Task>) =>
    apiFetch<Task>(c, "/tasks", { method: "POST", body }),
  task: (c: ApiConfig, id: string) => apiFetch<Task>(c, `/tasks/${id}`),
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
  reportHabit: (
    c: ApiConfig,
    id: string,
    type: "check_in" | "fall" | "reset",
    opts?: { for_date?: string }
  ) =>
    apiFetch<Habit>(c, `/habits/${id}/report`, {
      method: "POST",
      body: opts?.for_date ? { type, for_date: opts.for_date } : { type },
    }),
  habitHistory: (c: ApiConfig, id: string, days = 35) =>
    apiFetch<{
      reports: { report_date: string; outcome: "check_in" | "fall"; reported_at: string }[];
      grid: import("@/lib/habit-history").HabitHistoryDay[];
    }>(c, `/habits/${id}/history?days=${days}`),

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
  getEntry: (c: ApiConfig, id: string) => apiFetch<ContentEntry>(c, `/library/${id}`),
  createEntry: (c: ApiConfig, body: Partial<Omit<ContentEntry, "tags">> & { tags?: string | string[] }) =>
    apiFetch<ContentEntry>(c, "/library", { method: "POST", body }),
  updateEntry: (
    c: ApiConfig,
    id: string,
    body: Partial<Omit<ContentEntry, "tags">> & { tags?: string | string[] }
  ) => apiFetch<ContentEntry>(c, `/library/${id}`, { method: "PATCH", body }),
  deleteEntry: (c: ApiConfig, id: string) =>
    apiFetch<{ ok: boolean }>(c, `/library/${id}`, { method: "DELETE" }),

  timelineEventsPage: (
    c: ApiConfig,
    params?: { cursor?: string; limit?: number }
  ) => {
    const sp = new URLSearchParams();
    if (params?.cursor) sp.set("cursor", params.cursor);
    if (params?.limit) sp.set("limit", String(params.limit));
    const qs = sp.toString();
    return apiFetch<TimelineEventsPage>(c, `/timeline/events${qs ? `?${qs}` : ""}`);
  },
  timelineEvent: (c: ApiConfig, id: string) =>
    apiFetch<TimelineEvent>(c, `/timeline/events/${id}`),
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
    apiFetch<{
      ok: boolean;
      started?: boolean;
      alreadyRunning?: boolean;
      imported?: number;
      removed?: number;
      error?: string;
    }>(c, "/sync", { method: "POST", body: {} }),

  googleTasksStatus: (c: ApiConfig) => apiFetch<GoogleTasksStatusPayload>(c, "/integrations/google-tasks/status"),
  googleTasksLists: (c: ApiConfig) => apiFetch<{ id: string; title: string }[]>(c, "/integrations/google-tasks/lists"),
  patchGoogleTasksSettings: (c: ApiConfig, body: { selected_list_ids: string[] }) =>
    apiFetch(c, "/integrations/google-tasks/settings", { method: "PATCH", body }),
  disconnectGoogleTasks: (c: ApiConfig) =>
    apiFetch(c, "/integrations/google-tasks/disconnect", { method: "POST", body: {} }),

  gmailStatus: (c: ApiConfig) => apiFetch<GmailStatusPayload>(c, "/integrations/gmail/status"),
  disconnectGmail: (c: ApiConfig) =>
    apiFetch(c, "/integrations/gmail/disconnect", { method: "POST", body: {} }),
  syncTaskSources: (
    c: ApiConfig,
    provider?: string,
    opts?: { account_key?: string; list_ids?: string[] }
  ) =>
    apiFetch<{
      ok: boolean;
      provider?: string;
      started?: boolean;
      imported?: number;
      markedDone?: number;
      alreadyRunning?: boolean;
    }>(c, "/integrations/task-sources/sync", {
      method: "POST",
      body: {
        ...(provider ? { provider } : {}),
        ...(opts?.account_key ? { account_key: opts.account_key } : {}),
        ...(opts?.list_ids?.length ? { list_ids: opts.list_ids } : {}),
      },
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

  githubStatus: (c: ApiConfig) =>
    apiFetch<{
      connected: boolean;
      syncStatus?: "idle" | "running" | "completed" | "failed";
      syncProgress?: SyncProgress | null;
      lastSyncAt?: string | null;
      taskCount?: number;
      task_count_by_repo?: Record<string, number>;
      selected_list_ids?: string[];
      account_name?: string | null;
    }>(c, "/integrations/github/status"),
  githubRepos: (c: ApiConfig) =>
    apiFetch<{ id: string; title: string; owner: string; name: string }[]>(
      c,
      "/integrations/github/repos"
    ),
  patchGithubSettings: (c: ApiConfig, body: { selected_list_ids: string[] }) =>
    apiFetch(c, "/integrations/github/settings", { method: "PATCH", body }),
  disconnectGithub: (c: ApiConfig) =>
    apiFetch(c, "/integrations/github/disconnect", { method: "POST", body: {} }),

  registerPushToken: (
    c: ApiConfig,
    body: { expo_push_token: string; platform: string; device_id?: string | null }
  ) => apiFetch<{ ok: boolean }>(c, "/push/register", { method: "POST", body }),
  unregisterPushToken: (c: ApiConfig, expo_push_token: string) =>
    apiFetch<{ ok: boolean }>(c, "/push/register", {
      method: "DELETE",
      body: { expo_push_token },
    }),
  pushPreferences: (c: ApiConfig) =>
    apiFetch<{
      enabled: boolean;
      agent: boolean;
      relationships: boolean;
      habits: boolean;
      tasks: boolean;
      timeline: boolean;
      finance: boolean;
      quiet_start_hour: number;
      quiet_end_hour: number;
      updated_at: string;
    }>(c, "/push/preferences"),
  patchPushPreferences: (
    c: ApiConfig,
    body: Partial<{
      enabled: boolean;
      agent: boolean;
      relationships: boolean;
      habits: boolean;
      tasks: boolean;
      timeline: boolean;
      finance: boolean;
      quiet_start_hour: number;
      quiet_end_hour: number;
    }>
  ) =>
    apiFetch<{
      enabled: boolean;
      agent: boolean;
      relationships: boolean;
      habits: boolean;
      tasks: boolean;
      timeline: boolean;
      finance: boolean;
      quiet_start_hour: number;
      quiet_end_hour: number;
      updated_at: string;
    }>(c, "/push/preferences", { method: "PATCH", body }),
  pushTest: (c: ApiConfig) =>
    apiFetch<{ ok: boolean; sent?: number; failed?: number; reason?: string }>(
      c,
      "/push/test",
      { method: "POST", body: {} }
    ),

  financeCashflow: (c: ApiConfig, month: string) =>
    apiFetch<FinanceCashflow>(c, `/finance/cashflow?month=${encodeURIComponent(month)}`),
  financePlan: (c: ApiConfig, month: string) =>
    apiFetch<MonthPlanView>(c, `/finance/plan?month=${encodeURIComponent(month)}`),
  patchFinancePlan: (c: ApiConfig, month: string, body: { weekly_budget_override: number | null }) =>
    apiFetch<MonthPlanView>(c, `/finance/plan?month=${encodeURIComponent(month)}`, {
      method: "PATCH",
      body,
    }),
  financeCategories: (c: ApiConfig) =>
    apiFetch<{ categories: string[] }>(c, "/finance/categories"),
  patchFinancePlanLine: (
    c: ApiConfig,
    lineId: string,
    patch: number | { planned_amount?: number; line_type?: string }
  ) => {
    const body = typeof patch === "number" ? { planned_amount: patch } : patch;
    return apiFetch<PlanLineRow>(c, `/finance/plan/lines/${lineId}`, {
      method: "PATCH",
      body,
    });
  },
  addFinancePlanLine: (
    c: ApiConfig,
    body: { month: string; line_type: string; name: string; planned_amount: number; category?: string | null }
  ) => apiFetch<PlanLineRow>(c, "/finance/plan/lines", { method: "POST", body }),
  deleteFinancePlanLine: (c: ApiConfig, lineId: string) =>
    apiFetch<{ ok: boolean }>(c, `/finance/plan/lines/${lineId}`, { method: "DELETE" }),
  financeTransactions: (
    c: ApiConfig,
    params: { month?: string; uncategorized?: boolean; limit?: number }
  ) => {
    const sp = new URLSearchParams();
    if (params.month) sp.set("month", params.month);
    if (params.uncategorized) sp.set("uncategorized", "1");
    if (params.limit) sp.set("limit", String(params.limit));
    const q = sp.toString();
    return apiFetch<FinanceTransaction[]>(c, `/finance/transactions${q ? `?${q}` : ""}`);
  },
  financeTransaction: (c: ApiConfig, id: string) =>
    apiFetch<
      FinanceTransaction & {
        suggested_category: string | null;
        suggested_expense_type?: "fixed" | "variable" | "savings" | null;
        default_note?: string | null;
      }
    >(c, `/finance/transactions/${id}`),
  categorizeFinanceTransaction: (
    c: ApiConfig,
    id: string,
    body:
      | {
          category: string;
          purpose_note?: string | null;
          expense_type?: "fixed" | "variable" | "savings" | null;
          remember_rule?: boolean;
          txn_date?: string;
          txn_time?: string | null;
        }
      | { skip: true }
  ) => apiFetch<FinanceTransaction>(c, `/finance/transactions/${id}`, { method: "PATCH", body }),
  patchFinanceTransaction: (
    c: ApiConfig,
    id: string,
    body: {
      category?: string | null;
      purpose_note?: string | null;
      expense_type?: "fixed" | "variable" | "savings" | null;
      remember_rule?: boolean;
      skip?: boolean;
      txn_date?: string;
      txn_time?: string | null;
    }
  ) => apiFetch<FinanceTransaction>(c, `/finance/transactions/${id}`, { method: "PATCH", body }),
  financeSourcesStatus: (c: ApiConfig) =>
    apiFetch<FinanceSourcesStatusResponse>(c, "/finance/sources/status"),
  financeRecurringSuggestions: (c: ApiConfig, month?: string) =>
    apiFetch<{ suggestions: RecurringSuggestion[] }>(
      c,
      `/finance/recurring/suggestions${month ? `?month=${encodeURIComponent(month)}` : ""}`
    ),
  applyFinanceRecurringSuggestion: (
    c: ApiConfig,
    body: { merchant_key: string; category?: string | null; planned_amount?: number }
  ) => apiFetch<{ ok: boolean }>(c, "/finance/recurring/apply", { method: "POST", body }),
  financeForecast: (c: ApiConfig, month: string, months = 6) =>
    apiFetch<import("@/lib/finance/forecast").FinanceForecast>(
      c,
      `/finance/forecast?month=${encodeURIComponent(month)}&months=${months}`
    ),
  financeHistory: (c: ApiConfig, months = 6, month?: string) =>
    apiFetch<import("@/lib/finance/history").FinanceHistory>(
      c,
      `/finance/history?months=${months}${month ? `&month=${encodeURIComponent(month)}` : ""}`
    ),
  financeWealth: (c: ApiConfig) =>
    apiFetch<import("@/lib/finance/wealth-types").WealthSummary>(c, "/finance/wealth"),
  importWealthText: (
    c: ApiConfig,
    body: { import_text: string; source?: "har_bituach" | "cover_import" }
  ) =>
    apiFetch<{ imported: number; summary: import("@/lib/finance/wealth-types").WealthSummary }>(
      c,
      "/finance/wealth",
      { method: "POST", body }
    ),
  tradingDashboard: (c: ApiConfig) => apiFetch<import("@/lib/trading/service").DashboardPayload>(c, "/trading/dashboard"),
  tradingTrades: (c: ApiConfig, filters: Record<string, string | undefined> = {}) => {
    const q = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1]))).toString();
    return apiFetch<import("@/lib/trading/service").TradeListItem[]>(c, `/trading/trades${q ? `?${q}` : ""}`);
  },
  tradingTrade: (c: ApiConfig, id: string) =>
    apiFetch<TradingTradeDetail>(c, `/trading/trades/${encodeURIComponent(id)}`),
  patchTradingTrade: (c: ApiConfig, id: string, body: { notes?: string | null; tags?: string[]; self_rating?: number | null }) =>
    apiFetch<TradingTradeDetail>(c, `/trading/trades/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  tradingTriggers: (c: ApiConfig, symbol?: string) =>
    apiFetch<import("@/lib/trading/service").TriggerRow[]>(c, `/trading/triggers?limit=100${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ""}`),
  tradingAnalytics: (c: ApiConfig, scope: { execution: string; track: string; days: number }) =>
    apiFetch<import("@/lib/trading/service").AnalyticsPayload>(
      c,
      `/trading/analytics?execution=${scope.execution}&track=${scope.track}&days=${scope.days}`
    ),
  tradingBacktests: (c: ApiConfig) => apiFetch<TradingBacktestSummary[]>(c, "/trading/backtests"),
  tradingBacktest: (c: ApiConfig, id: string) => apiFetch<TradingBacktestDetail>(c, `/trading/backtests/${encodeURIComponent(id)}`),
  runTradingBacktest: (c: ApiConfig, body: { preset: "CRYPTO" | "STOCKS" | "ALL"; years: number }) =>
    apiFetch<{ id: string }>(c, "/trading/backtests", { method: "POST", body }),
  tradingPrice: (c: ApiConfig, symbol: string, assetClass: string) =>
    apiFetch<{ symbol: string; price: number; at: number }>(c, `/trading/price?symbol=${encodeURIComponent(symbol)}&asset_class=${encodeURIComponent(assetClass)}`),
  tradingSearch: (c: ApiConfig) => apiFetch<TradingProposal>(c, "/trading/search", { method: "POST", body: {} }),
  tradingEnterProposal: (c: ApiConfig, id: string, body: Record<string, unknown>) =>
    apiFetch<{ trade_id: string; broker: boolean; state: string | null; order_type: string; entry: number; stop: number; target: number; size: number; notes: string[] }>(c, `/trading/proposals/${encodeURIComponent(id)}/enter`, { method: "POST", body }),
  tradingControl: (c: ApiConfig, body: Record<string, unknown>) =>
    apiFetch<{ ok: boolean; message: string }>(c, "/trading/control", { method: "POST", body }),
  tradingUniverse: (c: ApiConfig) =>
    apiFetch<{ universe: import("@/lib/trading/store").UniverseRow[]; calendar: Array<{ id: string; kind: string; date: string; symbol: string | null; note: string | null; source: string }> }>(
      c,
      "/trading/universe"
    ),
  tradingParamSets: (c: ApiConfig) => apiFetch<TradingParamSet[]>(c, "/trading/calibration"),
  tradingCalibration: (c: ApiConfig, body: Record<string, unknown>) =>
    apiFetch<{ ok?: boolean; id?: string; recommend?: boolean }>(c, "/trading/calibration", { method: "POST", body }),
  tradingLearning: (c: ApiConfig) => apiFetch<TradingLearningView>(c, "/trading/learning"),
  tradingChat: (c: ApiConfig) => apiFetch<import("@/lib/trading/chat").ChatMessageRow[]>(c, "/trading/chat"),
  sendTradingChat: (c: ApiConfig, message: string) =>
    apiFetch<import("@/lib/trading/chat").ChatMessageRow>(c, "/trading/chat", { method: "POST", body: { message } }),
  confirmTradingChat: (c: ApiConfig, message_id: string, confirm: boolean) =>
    apiFetch<{ status: string; message: string }>(c, "/trading/chat/confirm", { method: "POST", body: { message_id, confirm } }),
  agentChat: (
    c: ApiConfig,
    body: { message: string; images?: Array<{ mimeType: string; data: string }> }
  ) => apiFetch<{ text: string; steps: number }>(c, "/agent/chat", { method: "POST", body }),
};
