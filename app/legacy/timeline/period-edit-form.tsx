"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LifePeriod } from "@/lib/life-periods";
import { inputClass } from "@/components/ui";
import { useTranslations } from "@/components/locale-provider";
import { deleteLifePeriod, updateLifePeriod } from "./actions";

export function PeriodEditForm({
  period,
  onClose,
}: {
  period: LifePeriod;
  onClose: () => void;
}) {
  const { t } = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function afterSave() {
    onClose();
    router.refresh();
  }

  function onUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateLifePeriod(fd);
      afterSave();
    });
  }

  function onDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm(t("timeline.deleteConfirmPeriod", { title: period.title }))) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await deleteLifePeriod(fd);
      afterSave();
    });
  }

  return (
    <div className="border-t border-border bg-bg/60 px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("timeline.editPeriod")}: {period.title}</h3>
        <button type="button" onClick={onClose} className="text-xs text-muted hover:text-ink">
          {t("common.close")}
        </button>
      </div>
      <form onSubmit={onUpdate} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={period.id} />
        <input type="text" name="title" defaultValue={period.title} required className={`${inputClass} sm:col-span-2`} />
        <label className="text-xs text-muted">
          {t("timeline.start")}
          <input type="date" name="start_date" defaultValue={period.start_date} required className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-muted">
          {t("timeline.end")}
          <input type="date" name="end_date" defaultValue={period.end_date || ""} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs text-muted">
          {t("timeline.kind")}
          <select name="kind" defaultValue={period.kind} className={`${inputClass} mt-1`}>
            <option value="period">{t("timeline.kindPeriod")}</option>
            <option value="relationship">{t("timeline.kindRelationship")}</option>
            <option value="milestone_band">{t("timeline.kindMilestone")}</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          {t("timeline.color")}
          <input type="color" name="color" defaultValue={period.color} className="mt-1 h-10 w-full rounded-lg border bg-transparent" />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            {pending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
      <form onSubmit={onDelete} className="mt-3">
        <input type="hidden" name="id" value={period.id} />
        <button type="submit" disabled={pending} className="text-sm text-warn hover:underline disabled:opacity-50">
          {t("timeline.deletePeriod")}
        </button>
      </form>
    </div>
  );
}
