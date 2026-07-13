import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../src/api/resources";
import { useApi, useMutate } from "../src/hooks";
import { useI18n } from "../src/i18n";
import { useColors, tokens } from "../src/theme";
import {
  Badge,
  Btn,
  Card,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Loading,
  Row,
  Screen,
  SectionTitle,
  confirmDelete,
} from "../src/components/ui";
import { FormModal } from "../src/components/form-modal";
import type { Commitment, Goal } from "@/lib/types";

type GoalForm = {
  id?: string;
  title: string;
  category: string;
  horizon: string;
  first_step: string;
  definition_of_done: string;
};

const emptyGoal: GoalForm = { title: "", category: "", horizon: "", first_step: "", definition_of_done: "" };

export default function GoalsScreen() {
  const c = useColors();
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { run, busy } = useMutate();

  const goalsQ = useApi(api.goals);
  const commitmentsQ = useApi(api.commitments);
  const [goalForm, setGoalForm] = useState<GoalForm | null>(null);
  const [commitmentText, setCommitmentText] = useState("");

  useEffect(() => {
    if (params.add === "goal") setGoalForm(emptyGoal);
    if (params.add) router.setParams({ add: "" });
  }, [params.add, router]);

  const goals = goalsQ.data ?? [];
  const active = goals.filter((g) => g.status === "active");
  const done = goals.filter((g) => g.status === "done");
  const commitments = commitmentsQ.data ?? [];
  const pending = commitments.filter((cm) => cm.status === "pending");
  const resolved = commitments.filter((cm) => cm.status !== "pending");

  async function submitGoal() {
    if (!goalForm || !goalForm.title.trim()) return;
    const body = {
      title: goalForm.title,
      category: goalForm.category || null,
      horizon: goalForm.horizon || null,
      first_step: goalForm.first_step || null,
      definition_of_done: goalForm.definition_of_done || null,
    };
    if (goalForm.id) await run((config) => api.updateGoal(config, goalForm.id!, body));
    else await run((config) => api.createGoal(config, body));
    setGoalForm(null);
    goalsQ.refresh();
  }

  async function toggleGoal(goal: Goal) {
    await run((config) => api.updateGoal(config, goal.id, { toggle_status: true }));
    goalsQ.refresh();
  }

  function removeGoal(goal: Goal) {
    confirmDelete(
      `${t("common.delete")}: ${goal.title}?`,
      async () => {
        await run((config) => api.deleteGoal(config, goal.id));
        setGoalForm(null);
        goalsQ.refresh();
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  async function addCommitment() {
    if (!commitmentText.trim()) return;
    await run((config) => api.createCommitment(config, { text: commitmentText.trim() }));
    setCommitmentText("");
    commitmentsQ.refresh();
  }

  async function setCommitment(cm: Commitment, status: Commitment["status"]) {
    await run((config) => api.setCommitmentStatus(config, cm.id, status));
    commitmentsQ.refresh();
  }

  function removeCommitment(cm: Commitment) {
    confirmDelete(
      `${t("common.delete")}?`,
      async () => {
        await run((config) => api.deleteCommitment(config, cm.id));
        commitmentsQ.refresh();
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  const goalCard = (goal: Goal) => (
    <Card key={goal.id} style={goal.status === "done" ? { opacity: 0.6 } : undefined}>
      <Pressable
        onPress={() =>
          setGoalForm({
            id: goal.id,
            title: goal.title,
            category: goal.category ?? "",
            horizon: goal.horizon ?? "",
            first_step: goal.first_step ?? "",
            definition_of_done: goal.definition_of_done ?? "",
          })
        }
      >
        <Row wrap style={{ justifyContent: "flex-start" }}>
          <Text style={{ color: c.ink, fontWeight: "700", textAlign: "right" }}>{goal.title}</Text>
          {goal.category ? <Badge label={goal.category} tone="accent" /> : null}
          {goal.horizon ? <Badge label={`${t("common.horizon")}: ${goal.horizon}`} /> : null}
        </Row>
        {goal.first_step ? (
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "right", marginTop: 4 }}>
            {t("common.firstStep")}: {goal.first_step}
          </Text>
        ) : null}
        {goal.definition_of_done ? (
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "right", marginTop: 2 }}>
            {t("common.definitionOfDone")}: {goal.definition_of_done}
          </Text>
        ) : null}
      </Pressable>
      <Row style={{ marginTop: 10 }}>
        <Btn
          small
          label={goal.status === "active" ? t("goals.markDoneBtn") : t("goals.restoreActive")}
          variant={goal.status === "active" ? "primary" : "ghost"}
          onPress={() => toggleGoal(goal)}
          disabled={busy}
        />
      </Row>
    </Card>
  );

  return (
    <Screen
      title={t("goals.title")}
      subtitle={t("goals.subtitle")}
      refreshing={goalsQ.loading || commitmentsQ.loading}
      onRefresh={() => {
        goalsQ.refresh();
        commitmentsQ.refresh();
      }}
      headerRight={<Btn small label={t("goals.addNew")} onPress={() => setGoalForm(emptyGoal)} />}
    >
      {goalsQ.error ? <ErrorNote message={goalsQ.error} onRetry={goalsQ.refresh} /> : null}
      {goalsQ.loading && !goalsQ.data ? <Loading /> : null}
      {goalsQ.data && active.length === 0 ? <EmptyState text={t("goals.noActive")} /> : null}
      {active.map(goalCard)}

      {done.length > 0 ? (
        <>
          <SectionTitle>{t("goals.fulfilledDreams", { count: done.length })}</SectionTitle>
          {done.map(goalCard)}
        </>
      ) : null}

      <SectionTitle>{t("goals.commitmentsTitle")}</SectionTitle>
      <Text style={{ color: c.muted, fontSize: tokens.textSm, textAlign: "right", marginBottom: 8 }}>
        {t("goals.commitmentsHint")}
      </Text>
      <Card>
        <Input
          value={commitmentText}
          onChangeText={setCommitmentText}
          placeholder={t("goals.commitmentPlaceholder")}
        />
        <Btn label={t("common.add")} onPress={addCommitment} disabled={busy || !commitmentText.trim()} />
      </Card>
      {commitmentsQ.data && commitments.length === 0 ? <EmptyState text={t("goals.noCommitments")} /> : null}
      {[...pending, ...resolved].map((cm) => (
        <Card key={cm.id} style={cm.status !== "pending" ? { opacity: 0.6 } : undefined}>
          <Text style={{ color: c.ink, textAlign: "right" }}>{cm.text}</Text>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "right", marginTop: 2 }}>
            {cm.commitment_date}
          </Text>
          <Row style={{ marginTop: 8 }}>
            {cm.status === "pending" ? (
              <>
                <Btn small label={t("common.done")} onPress={() => setCommitment(cm, "done")} disabled={busy} />
                <Btn small variant="warn" label={t("common.missed")} onPress={() => setCommitment(cm, "missed")} disabled={busy} />
              </>
            ) : (
              <Badge label={cm.status === "done" ? t("common.done") : t("common.missed")} tone={cm.status === "done" ? "good" : "warn"} />
            )}
            <View style={{ flex: 1 }} />
            <Btn small variant="ghost" label={t("common.delete")} onPress={() => removeCommitment(cm)} />
          </Row>
        </Card>
      ))}

      <FormModal
        visible={goalForm !== null}
        title={goalForm?.id ? t("goals.editGoal") : t("goals.addNew")}
        onClose={() => setGoalForm(null)}
        onSubmit={submitGoal}
        submitLabel={goalForm?.id ? t("goals.saveChanges") : t("common.add")}
        busy={busy}
        onDelete={
          goalForm?.id
            ? () => {
                const goal = goals.find((x) => x.id === goalForm.id);
                if (goal) removeGoal(goal);
              }
            : undefined
        }
      >
        {goalForm ? (
          <View>
            <Input value={goalForm.title} onChangeText={(v) => setGoalForm({ ...goalForm, title: v })} placeholder={t("goals.titlePlaceholder")} />
            <Input value={goalForm.category} onChangeText={(v) => setGoalForm({ ...goalForm, category: v })} placeholder={t("goals.categoryPlaceholder")} />
            <Input value={goalForm.horizon} onChangeText={(v) => setGoalForm({ ...goalForm, horizon: v })} placeholder={t("goals.horizonPlaceholder")} />
            <Input value={goalForm.first_step} onChangeText={(v) => setGoalForm({ ...goalForm, first_step: v })} placeholder={t("goals.firstStepPlaceholder")} />
            <Input
              value={goalForm.definition_of_done}
              onChangeText={(v) => setGoalForm({ ...goalForm, definition_of_done: v })}
              placeholder={t("goals.doneDefinitionPlaceholder")}
            />
          </View>
        ) : null}
      </FormModal>
    </Screen>
  );
}
