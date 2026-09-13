import type { PlanLineType } from "@/lib/finance/expense-type";
import type { WeekBucket, WeeklyPace } from "@/lib/finance/weekly";

export type PlanLineRow = {
  id: string;
  plan_id: string;
  line_type: PlanLineType;
  name: string;
  category: string | null;
  planned_amount: number;
  sort_order: number;
};

export type PlanLineView = PlanLineRow & { actual_amount: number };

export type PlanSectionView = {
  line_type: PlanLineType;
  lines: PlanLineView[];
  planned_total: number;
  actual_total: number;
};

export type MonthPlanView = {
  month: string;
  plan_id: string;
  weekly_budget_override: number | null;
  sections: Record<PlanLineType, PlanSectionView>;
  totals: {
    planned_income: number;
    actual_income: number;
    planned_expense: number;
    actual_expense: number;
    net_planned: number;
    net_actual: number;
    savings_planned: number;
  };
  weeks: WeekBucket[];
  weekly_pace: WeeklyPace | null;
};
