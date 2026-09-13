/**
 * Query key factory for all server-state domains.
 * Ensures consistent cache-invalidation and optimistic update targeting.
 */
export const queryKeys = {
  home: ["home"] as const,
  projects: ["projects"] as const,
  tasks: (params?: Record<string, unknown>) =>
    params && Object.keys(params).length > 0
      ? (["tasks", params] as const)
      : (["tasks"] as const),
  tasksAll: ["tasks"] as const,
  habits: ["habits"] as const,
  relationships: ["relationships"] as const,
  goals: ["goals"] as const,
  commitments: ["commitments"] as const,
  library: (params?: Record<string, unknown>) =>
    params && Object.keys(params).length > 0
      ? (["library", params] as const)
      : (["library"] as const),
  libraryAll: ["library"] as const,
  timelineEvents: ["timelineEvents"] as const,
  timelineEvent: (id: string) => ["timelineEvent", id] as const,
  periods: ["periods"] as const,
  syncStatus: ["syncStatus"] as const,
  googleTasksStatus: ["googleTasksStatus"] as const,
  gmailStatus: ["gmailStatus"] as const,
  mondayAccounts: ["mondayAccounts"] as const,
  githubStatus: ["githubStatus"] as const,
  financeSourcesStatus: ["financeSourcesStatus"] as const,
  financeCashflow: (month: string) => ["financeCashflow", month] as const,
  financeTransactions: (month: string) => ["financeTransactions", month] as const,
  financePlan: (month: string) => ["financePlan", "v2", month] as const,
  financeRecurringSuggestions: (month?: string) => ["financeRecurringSuggestions", month ?? "current"] as const,
  financeForecast: (month: string) => ["financeForecast", month] as const,
  financeHistory: (months: number) => ["financeHistory", months] as const,
  financeWealth: ["financeWealth"] as const,
  eventLinks: (eventId: string) => ["eventLinks", eventId] as const,
  libraryEntry: (id: string) => ["libraryEntry", id] as const,
};
