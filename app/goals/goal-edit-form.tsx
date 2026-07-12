"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Goal } from "@/lib/types";
import { inputClass } from "@/components/ui";
import { updateGoal } from "./actions";
import { useTranslations } from "@/components/locale-provider";

export function GoalEditForm({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const router = useRouter();
  const { t } = useTranslations();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateGoal(fd);
      onClose();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-2 grid gap-1.5 rounded-lg border border-border/60 bg-bg/40 p-2.5 text-xs sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={goal.id} />
      <input
        type="text"
        name="title"
        defaultValue={goal.title}
        required
        className={`${inputClass} sm:col-span-2`}
        placeholder={t("goals.titlePlaceholder")}
      />
      <input
        type="text"
        name="category"
        defaultValue={goal.category || ""}
        placeholder={t("goals.categoryPlaceholder")}
        className={inputClass}
      />
      <input
        type="text"
        name="horizon"
        defaultValue={goal.horizon || ""}
        placeholder={t("goals.horizonPlaceholder")}
        className={inputClass}
      />
      <input
        type="text"
        name="first_step"
        defaultValue={goal.first_step || ""}
        placeholder={t("goals.firstStepPlaceholder")}
        className={inputClass}
      />
      <input
        type="text"
        name="definition_of_done"
        defaultValue={goal.definition_of_done || ""}
        placeholder={t("goals.doneDefinitionPlaceholder")}
        className={inputClass}
      />
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-2.5 py-1 font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("common.saving") : t("goals.saveChanges")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2.5 py-1 text-muted hover:text-ink"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
