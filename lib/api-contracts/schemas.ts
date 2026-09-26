import { z } from "zod";
import { HOME_TRADING_LEGACY_FIELDS } from "@/lib/home-snapshots";
import { PLAN_SECTION_ORDER } from "@/lib/finance/expense-type";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/);
const isoDateTime = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/));

export const homeTradingSchema = z
  .object({
    phase: z.string(),
    equity: z.number(),
    starting_equity: z.number(),
    kill_switch_active: z.boolean(),
  })
  .strict();

export const homeResponseSchema = z
  .object({
    degraded: z.array(z.string()).optional(),
    habits: z.array(z.record(z.string(), z.unknown())),
    habitsPending: z.number(),
    habitsOverdue: z.number(),
    activeGoals: z.array(z.record(z.string(), z.unknown())),
    doneGoalsCount: z.number(),
    pendingCommitments: z.array(z.record(z.string(), z.unknown())),
    relationships: z.array(z.record(z.string(), z.unknown())),
    recentEvents: z.array(z.record(z.string(), z.unknown())),
    eventsMode: z.enum(["upcoming", "recent"]),
    openTasks: z.array(z.record(z.string(), z.unknown())),
    projects: z.array(z.record(z.string(), z.unknown())),
    libraryEntries: z.array(z.record(z.string(), z.unknown())),
    openTasksCount: z.number(),
    inProgressTasksCount: z.number(),
    doneTasksCount: z.number(),
    avgTaskCloseDays: z.number().nullable(),
    financeUncategorizedCount: z.number(),
    urgentFinance: z
      .object({ id: z.string(), titleOrAmountLabel: z.string() })
      .nullable(),
    finance: z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      net_actual: z.number(),
      uncategorized_count: z.number(),
    }),
    trading: homeTradingSchema.nullable(),
  })
  .passthrough();

export const taskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    project_id: z.string().nullable(),
    priority: z.enum(["urgent", "high", "medium", "low"]),
    status: z.enum(["open", "in_progress", "stuck", "review", "done"]),
    due_date: isoDate.nullable(),
    notes: z.string().nullable(),
    source: z.enum(["manual", "google_tasks", "monday", "github", "gmail"]),
    external_id: z.string().nullable(),
    external_list_id: z.string().nullable(),
    external_meta: z.record(z.string(), z.unknown()),
    synced_at: isoDateTime.nullable(),
    created_at: isoDateTime,
    updated_at: isoDateTime,
  })
  .passthrough();

export const tasksResponseSchema = z.array(taskSchema);

export const habitSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(["build", "quit"]),
    target_note: z.string().nullable(),
    streak_count: z.number(),
    best_streak: z.number(),
    total_success_days: z.number(),
    failure_count: z.number(),
    last_checked_on: isoDate.nullable(),
    archived: z.boolean(),
    created_at: isoDateTime,
  })
  .passthrough();

export const habitsResponseSchema = z.array(habitSchema);

export const goalSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.enum(["active", "done"]),
    sort_order: z.number(),
    created_at: isoDateTime,
  })
  .passthrough();

export const goalsResponseSchema = z.array(goalSchema);

export const planSectionSchema = z.object({
  line_type: z.enum(["income", "fixed", "variable", "planned", "savings"]),
  lines: z.array(z.record(z.string(), z.unknown())),
  planned_total: z.number(),
  actual_total: z.number(),
});

export const financeTransactionSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    external_key: z.string(),
    txn_date: isoDate,
    amount: z.number(),
    kind: z.enum(["income", "expense"]),
    currency: z.string(),
    original_amount: z.number().nullable(),
    amount_ils: z.number().nullable(),
    ils_estimated: z.boolean(),
    description: z.string(),
    merchant: z.string().nullable(),
    merchant_display: z.string(),
    account_number: z.string().nullable(),
    card_name: z.string().nullable(),
    status: z.enum(["pending", "completed"]),
    category: z.string().nullable(),
    purpose_note: z.string().nullable(),
    expense_type: z.enum(["fixed", "variable", "savings"]).nullable(),
    txn_time: z.string().nullable().optional(),
    installment_index: z.number().nullable(),
    installment_total: z.number().nullable(),
    installment_label: z.string().nullable(),
    is_internal: z.boolean(),
    needs_categorization: z.boolean(),
    categorized_at: isoDateTime.nullable(),
    created_at: isoDateTime,
    updated_at: isoDateTime,
  })
  .passthrough();

export const financeTransactionsResponseSchema = z.array(financeTransactionSchema);

export const financePlanResponseSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    plan_id: z.string(),
    weekly_budget_override: z.number().nullable(),
    sections: z.record(z.enum(["income", "fixed", "variable", "planned", "savings"]), planSectionSchema),
    totals: z.object({
      planned_income: z.number(),
      actual_income: z.number(),
      planned_expense: z.number(),
      actual_expense: z.number(),
      net_planned: z.number(),
      net_actual: z.number(),
      savings_planned: z.number(),
    }),
    weeks: z.array(z.record(z.string(), z.unknown())),
    weekly_pace: z.record(z.string(), z.unknown()).nullable(),
  })
  .passthrough();

export const relationshipSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    project_id: z.string(),
    created_at: isoDateTime,
  })
  .passthrough();

export const relationshipsResponseSchema = z.array(relationshipSchema);

export const tradingEquityResponseSchema = z
  .object({
    equity: z.number(),
    starting_equity: z.number(),
    peak_equity: z.number(),
    kill_switch_active: z.boolean(),
    phase: z.string(),
    updated_at: isoDateTime,
  })
  .strict();

export const tradingDashboardResponseSchema = z
  .object({
    settings: z.record(z.string(), z.unknown()),
    account: z.object({
      equity: z.number(),
      starting_equity: z.number(),
    }),
    positions: z.array(z.record(z.string(), z.unknown())),
    other_positions: z.array(z.record(z.string(), z.unknown())),
    equity_history: z.array(
      z.object({ day: z.string(), equity: z.number(), open_risk_r: z.number() })
    ),
  })
  .passthrough();

/** Paths the mobile app reads — used by contract + smoke tests. */
export const MOBILE_API_CONTRACTS = {
  home: { path: "/api/v1/home", schema: homeResponseSchema },
  tasks: { path: "/api/v1/tasks", schema: tasksResponseSchema },
  habits: { path: "/api/v1/habits", schema: habitsResponseSchema },
  goals: { path: "/api/v1/goals", schema: goalsResponseSchema },
  financePlan: { path: "/api/v1/finance/plan", schema: financePlanResponseSchema, query: "month" },
  financeTransactions: {
    path: "/api/v1/finance/transactions",
    schema: financeTransactionsResponseSchema,
    query: "month",
  },
  relationships: { path: "/api/v1/relationships", schema: relationshipsResponseSchema },
  tradingEquity: { path: "/api/v1/trading/equity", schema: tradingEquityResponseSchema },
  tradingDashboard: { path: "/api/v1/trading/dashboard", schema: tradingDashboardResponseSchema },
} as const;

export function assertHomeTradingLegacyFields(trading: unknown): string | null {
  if (trading === null) return null;
  if (!trading || typeof trading !== "object") return "trading_not_object";
  for (const key of HOME_TRADING_LEGACY_FIELDS) {
    if (!(key in trading)) return `missing_trading_field:${key}`;
  }
  const parsed = homeTradingSchema.safeParse(trading);
  if (!parsed.success) return `invalid_trading_shape:${parsed.error.issues[0]?.message ?? "unknown"}`;
  return null;
}

export function assertFinancePlanSections(sections: unknown): string | null {
  if (!sections || typeof sections !== "object") return "missing_plan_sections";
  for (const key of PLAN_SECTION_ORDER) {
    if (!(key in sections)) return `missing_plan_section:${key}`;
  }
  return null;
}
