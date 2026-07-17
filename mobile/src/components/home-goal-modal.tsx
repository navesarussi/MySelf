import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../api/resources";
import { useMutate } from "../hooks";
import { useI18n } from "../i18n";
import { FormModal } from "./form-modal";
import { Input, confirmDelete } from "./ui";
import type { Goal } from "@/lib/types";

type GoalForm = {
  id: string;
  title: string;
  category: string;
  horizon: string;
  first_step: string;
  definition_of_done: string;
};

function toForm(goal: Goal): GoalForm {
  return {
    id: goal.id,
    title: goal.title,
    category: goal.category ?? "",
    horizon: goal.horizon ?? "",
    first_step: goal.first_step ?? "",
    definition_of_done: goal.definition_of_done ?? "",
  };
}

export function HomeGoalModal({
  goal,
  onClose,
  onSaved,
}: {
  goal: Goal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { run, busy } = useMutate();
  const [form, setForm] = useState<GoalForm | null>(null);

  useEffect(() => {
    setForm(goal ? toForm(goal) : null);
  }, [goal]);

  async function submit() {
    if (!form || !form.title.trim()) return;
    await run(
      (config) =>
        api.updateGoal(config, form.id, {
          title: form.title,
          category: form.category || null,
          horizon: form.horizon || null,
          first_step: form.first_step || null,
          definition_of_done: form.definition_of_done || null,
        }),
      { success: "flash.goalUpdated" }
    );
    onClose();
    onSaved();
  }

  function remove() {
    if (!form) return;
    confirmDelete(
      `${t("common.delete")}: ${form.title}?`,
      async () => {
        await run((config) => api.deleteGoal(config, form.id), { success: "flash.goalDeleted" });
        onClose();
        onSaved();
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  return (
    <FormModal
      visible={goal !== null}
      title={t("goals.editGoal")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t("goals.saveChanges")}
      busy={busy}
      onDelete={form ? remove : undefined}
    >
      {form ? (
        <View>
          <Input value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder={t("goals.titlePlaceholder")} />
          <Input value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} placeholder={t("goals.categoryPlaceholder")} />
          <Input value={form.horizon} onChangeText={(v) => setForm({ ...form, horizon: v })} placeholder={t("goals.horizonPlaceholder")} />
          <Input value={form.first_step} onChangeText={(v) => setForm({ ...form, first_step: v })} placeholder={t("goals.firstStepPlaceholder")} />
          <Input
            value={form.definition_of_done}
            onChangeText={(v) => setForm({ ...form, definition_of_done: v })}
            placeholder={t("goals.doneDefinitionPlaceholder")}
          />
        </View>
      ) : null}
    </FormModal>
  );
}
