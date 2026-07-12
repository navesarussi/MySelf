"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui";
import { useTranslations } from "@/components/locale-provider";
import { GoalEditForm } from "@/app/goals/goal-edit-form";
import { achievabilityScore, horizonLabel } from "@/lib/goals-rank";
import type { Goal } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

export function HomeGoalRow({ goal, locale }: { goal: Goal; locale: Locale }) {
  const { t } = useTranslations();
  const [editing, setEditing] = useState(false);

  return (
    <li className="rounded-lg bg-border/20 px-2.5 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{goal.title}</span>
        {achievabilityScore(goal) >= 3 && <Badge tone="good">{t("common.readyToAct")}</Badge>}
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
        {goal.category && <span>{goal.category}</span>}
        {horizonLabel(goal, locale) && <span>· {horizonLabel(goal, locale)}</span>}
      </div>
      {goal.first_step && (
        <p className="mt-1 text-xs text-muted">
          {t("common.firstStep")}: {goal.first_step}
        </p>
      )}
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        className="mt-2 flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] text-muted hover:text-accent"
        aria-expanded={editing}
      >
        <Pencil size={12} />
        {t("goals.editGoal")}
      </button>
      {editing && <GoalEditForm goal={goal} onClose={() => setEditing(false)} />}
    </li>
  );
}
