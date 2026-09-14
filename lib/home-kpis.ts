export type HomeKpiHref = "/habits" | "/relationships" | "/goals" | "/tasks" | "/finance" | "/trading";

export type HomeKpiInput = {
  habitsCount: number;
  dueRelationships: number;
  activeGoals: number;
  openTasks: number;
  habitsPending: number;
  habitsOverdue: number;
  tasksDueSoon: number;
  doneTasks: number;
  avgTaskCloseDays: number | null;
  bestStreak: number;
  readyGoals: number;
  financeUncategorized: number;
  financeNet: number;
  tradingEquity: number | null;
  tradingKill: boolean;
};

export type HomeKpiSpec = {
  id: string;
  labelKey: string;
  value: string;
  hintKey?: string;
  hintParams?: Record<string, string | number>;
  tone: "good" | "warn" | "default";
  href: HomeKpiHref;
};

export function homeHeroCount(i: {
  habitsOverdue: number;
  dueRelationships: number;
  tasksDueSoon: number;
  financeUncategorized: number;
}): number {
  return i.habitsOverdue + i.dueRelationships + i.tasksDueSoon + i.financeUncategorized;
}

export function buildHomeKpis(i: HomeKpiInput): HomeKpiSpec[] {
  const items: HomeKpiSpec[] = [
    {
      id: "tasks",
      labelKey: "home.openTasks",
      value: String(i.openTasks),
      tone: i.openTasks > 0 ? "default" : "good",
      href: "/tasks",
    },
    {
      id: "habits-pending",
      labelKey: "home.habitsPendingToday",
      value: String(i.habitsPending),
      hintKey: i.habitsOverdue > 0 ? "home.habitsOverdueSub" : "home.habitsPendingSub",
      hintParams: i.habitsOverdue > 0 ? { count: i.habitsOverdue } : undefined,
      tone: i.habitsOverdue > 0 ? "warn" : i.habitsPending > 0 ? "default" : "good",
      href: "/habits",
    },
    {
      id: "relationships",
      labelKey: "home.relationshipsOverdue",
      value: String(i.dueRelationships),
      tone: i.dueRelationships > 0 ? "warn" : "good",
      href: "/relationships",
    },
    {
      id: "goals",
      labelKey: "home.activeGoals",
      value: String(i.activeGoals),
      tone: "default",
      href: "/goals",
    },
    {
      id: "finance-net",
      labelKey: "home.financeNet",
      value: String(i.financeNet),
      tone: i.financeNet < 0 ? "warn" : i.financeNet > 0 ? "good" : "default",
      href: "/finance",
    },
    {
      id: "habits",
      labelKey: "home.activeHabits",
      value: String(i.habitsCount),
      tone: "default",
      href: "/habits",
    },
    {
      id: "tasks-due",
      labelKey: "home.tasksDueSoon",
      value: String(i.tasksDueSoon),
      tone: i.tasksDueSoon > 0 ? "warn" : "default",
      href: "/tasks",
    },
    {
      id: "tasks-done",
      labelKey: "home.tasksDone",
      value: String(i.doneTasks),
      hintKey: i.avgTaskCloseDays != null ? "home.avgTaskCloseDays" : undefined,
      hintParams: i.avgTaskCloseDays != null ? { days: i.avgTaskCloseDays } : undefined,
      tone: "good",
      href: "/tasks",
    },
    {
      id: "streak",
      labelKey: "home.bestActiveStreak",
      value: String(i.bestStreak),
      tone: "default",
      href: "/habits",
    },
    {
      id: "ready-goals",
      labelKey: "home.readyGoals",
      value: String(i.readyGoals),
      tone: "good",
      href: "/goals",
    },
  ];
  if (i.tradingEquity !== null) {
    items.splice(5, 0, {
      id: "trading",
      labelKey: "home.tradingEquity",
      value: String(i.tradingEquity),
      tone: i.tradingKill ? "warn" : "default",
      href: "/trading",
    });
  }
  if (i.financeUncategorized > 0) {
    items.push({
      id: "finance-uncat",
      labelKey: "home.financeUncategorized",
      value: String(i.financeUncategorized),
      tone: "warn",
      href: "/finance",
    });
  }
  return items;
}
