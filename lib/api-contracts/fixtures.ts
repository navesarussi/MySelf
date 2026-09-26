import type { MonthPlanView } from "@/lib/finance/plan-types";
const now = "2026-09-26T12:00:00.000Z";
const today = "2026-09-26";

function emptyPlanSection(line_type: MonthPlanView["sections"][keyof MonthPlanView["sections"]]["line_type"]) {
  return { line_type, lines: [], planned_total: 0, actual_total: 0 };
}

export const homeFixture = {
  habits: [
    {
      id: "h1",
      name: "Run",
      kind: "build" as const,
      target_note: null,
      streak_count: 3,
      best_streak: 5,
      total_success_days: 10,
      failure_count: 1,
      last_checked_on: today,
      report_time: "08:00",
      last_reported_at: now,
      archived: false,
      created_at: now,
    },
  ],
  habitsPending: 1,
  habitsOverdue: 0,
  activeGoals: [
    {
      id: "g1",
      title: "Ship",
      category: null,
      horizon: null,
      first_step: null,
      definition_of_done: null,
      status: "active" as const,
      sort_order: 0,
      created_at: now,
    },
  ],
  doneGoalsCount: 2,
  pendingCommitments: [],
  relationships: [
    {
      id: "r1",
      name: "Alex",
      last_contact_date: today,
      reminder_days: 14,
      phone: null,
      email: null,
    },
  ],
  recentEvents: [],
  eventsMode: "recent" as const,
  openTasks: [
    {
      id: "t1",
      title: "Task",
      project_id: "p1",
      priority: "medium" as const,
      status: "open" as const,
      due_date: null,
      notes: null,
      source: "manual" as const,
      external_id: null,
      external_list_id: null,
      external_meta: {},
      synced_at: null,
      created_at: now,
      updated_at: now,
    },
  ],
  projects: [{ id: "p1", name: "Inbox", sort_order: 0, created_at: now }],
  libraryEntries: [],
  openTasksCount: 1,
  inProgressTasksCount: 0,
  doneTasksCount: 5,
  avgTaskCloseDays: 3.5,
  financeUncategorizedCount: 0,
  urgentFinance: null,
  finance: { month: "2026-09", net_actual: 1200, uncategorized_count: 0 },
  trading: {
    phase: "PAPER",
    equity: 78_701,
    starting_equity: 100_000,
    kill_switch_active: false,
  },
};

export const tasksFixture = homeFixture.openTasks;

export const habitsFixture = homeFixture.habits;

export const goalsFixture = homeFixture.activeGoals;

export const relationshipsFixture = [
  {
    id: "r1",
    name: "Alex",
    group_name: null,
    last_contact_date: today,
    reminder_days: 14,
    notes: null,
    phone: null,
    email: null,
    project_id: "p1",
    project_name: "Inbox",
    created_at: now,
  },
];

export const tradingEquityFixture = {
  equity: 78_701,
  starting_equity: 100_000,
  peak_equity: 100_000,
  kill_switch_active: false,
  phase: "PAPER",
  updated_at: now,
};

export const tradingDashboardFixture = {
  settings: { phase: "PAPER", starting_equity: 100_000, kill_switch_active: false },
  params: {},
  params_locked_until: null,
  account: {
    equity: 78_701,
    starting_equity: 100_000,
    peak_equity: 100_000,
    drawdown_pct: 0.21,
    open_risk_r: 1.2,
    pnl_day: -100,
    pnl_week: -500,
    pnl_month: -1200,
    r_day: -0.1,
    r_week: -0.5,
    r_month: -1.2,
    halted_daily: false,
    halted_weekly: false,
    kill_switch_distance_pct: 0.15,
  },
  positions: [],
  other_positions: [],
  shadow_open: 0,
  gate: { phase: "PAPER", allowed: true, checks: [] },
  equity_history: [{ day: today, equity: 78_701, open_risk_r: 1.2 }],
  envelope: {},
  execution_rules: {},
};

export const financeTransactionsFixture = [
  {
    id: "txn-1",
    source: "visa_cal",
    external_key: "cal-1",
    txn_date: "2026-09-15",
    amount: 120.5,
    kind: "expense" as const,
    currency: "ILS",
    original_amount: null,
    amount_ils: null,
    ils_estimated: false,
    description: "מזוןומשקארמילוי-ראשוןלציון",
    merchant: "מזוןומשקארמילוי-ראשוןלציון",
    merchant_display: "רמי לוי ראשון לציון",
    account_number: null,
    card_name: "Visa",
    status: "completed" as const,
    category: "מזון",
    purpose_note: null,
    expense_type: "variable" as const,
    txn_time: null,
    installment_index: null,
    installment_total: null,
    installment_label: null,
    is_internal: false,
    needs_categorization: false,
    categorized_at: now,
    created_at: now,
    updated_at: now,
  },
];

export const financePlanFixture: MonthPlanView = {
  month: "2026-09",
  plan_id: "plan-1",
  weekly_budget_override: null,
  sections: {
    income: emptyPlanSection("income"),
    fixed: emptyPlanSection("fixed"),
    variable: emptyPlanSection("variable"),
    planned: emptyPlanSection("planned"),
    savings: emptyPlanSection("savings"),
  },
  totals: {
    planned_income: 20000,
    actual_income: 18000,
    planned_expense: 15000,
    actual_expense: 14000,
    net_planned: 5000,
    net_actual: 4000,
    savings_planned: 2000,
  },
  weeks: [],
  weekly_pace: null,
};
