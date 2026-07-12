import type { Habit } from "@/lib/types";
import { SubmitButton, inputClass } from "@/components/ui";
import { AddFormToggle } from "@/components/add-form-toggle";
import { todayISO } from "@/lib/habit-stats";
import { addHabit } from "./actions";
import { HabitCard } from "./habit-card";
import { getTranslations } from "@/lib/i18n";

export async function HabitsSection({
  habits,
  defaultOpen = false,
}: {
  habits: Habit[];
  defaultOpen?: boolean;
}) {
  const { t } = await getTranslations();
  const today = todayISO();

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-bold">{t("habits.sectionTitle")}</h2>

      <div className="grid gap-2 sm:grid-cols-2">
        {habits.map((h) => (
          <HabitCard key={h.id} habit={h} today={today} />
        ))}
      </div>

      <AddFormToggle
        label={t("habits.addNew")}
        defaultOpen={defaultOpen}
        className="mt-4"
        id="add-form-habit"
      >
        <form action={addHabit} className="card grid gap-2 p-3 sm:grid-cols-2">
          <input type="text" name="name" placeholder={t("habits.namePlaceholder")} required className={inputClass} />
          <select name="kind" className={inputClass} defaultValue="build">
            <option value="build">{t("habits.buildNew")}</option>
            <option value="quit">{t("habits.quitBad")}</option>
          </select>
          <input
            type="text"
            name="target_note"
            placeholder={t("habits.targetNotePlaceholder")}
            className={`${inputClass} sm:col-span-2`}
          />
          <div className="sm:col-span-2">
            <SubmitButton>{t("common.add")}</SubmitButton>
          </div>
        </form>
      </AddFormToggle>
    </section>
  );
}
