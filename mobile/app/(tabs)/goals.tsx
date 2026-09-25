import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, type HomePayload } from "../../src/api/resources";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
import {
  useApiQuery,
  useApiMutation,
  queryKeys,
  queryClient,
  patchItemInList,
  removeItemFromList,
  patchGoalInHome,
  removeGoalFromHome,
  removeCommitmentFromHome,
  setGoalStatusInHome,
} from "../../src/query";
import {
  Btn,
  Card,
  EmptyState,
  ErrorNote,
  Input,
  ListSkeleton,
  ScreenList,
  SectionTitle,
  confirmDelete,
} from "../../src/components/ui";
import { ScreenErrorBoundary } from "../../src/components/error-boundary";
import { FormModal } from "../../src/components/form-modal";
import { GoalCard } from "../../src/components/goal-card";
import { CommitmentCard } from "../../src/components/commitment-card";
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
  const { textStart, textLtr, writingDirection } = useLayoutDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { run, isPending, busy } = useApiMutation();

  const goalsQ = useApiQuery(queryKeys.goals, api.goals);
  const commitmentsQ = useApiQuery(queryKeys.commitments, api.commitments);
  const [goalForm, setGoalForm] = useState<GoalForm | null>(null);
  const [commitmentText, setCommitmentText] = useState("");
  const [commitmentFocus, setCommitmentFocus] = useState(false);

  useEffect(() => {
    if (params.add === "goal") setGoalForm(emptyGoal);
    if (params.add === "commitment") setCommitmentFocus(true);
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
    const targetId = goalForm.id;
    setGoalForm(null);

    if (targetId) {
      await run((config) => api.updateGoal(config, targetId, body), {
        itemId: targetId,
        flash: { success: "flash.goalUpdated" },
        onSuccess: (updated) => {
          if (updated) {
            queryClient.setQueryData<Goal[]>(queryKeys.goals, (old) =>
              patchItemInList(old, targetId, updated)
            );
            queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
              patchGoalInHome(old, targetId, updated)
            );
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.goals });
        },
      });
    } else {
      await run((config) => api.createGoal(config, body), {
        flash: { success: "flash.goalAdded" },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.goals });
          queryClient.invalidateQueries({ queryKey: queryKeys.home });
        },
      });
    }
  }

  const toggleGoal = useCallback(
    async (goal: Goal) => {
      const nextStatus = goal.status === "active" ? "done" : "active";
      const prevGoals = queryClient.getQueryData<Goal[]>(queryKeys.goals);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
      queryClient.setQueryData<Goal[]>(queryKeys.goals, (old) =>
        patchItemInList(old, goal.id, { status: nextStatus })
      );
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
        setGoalStatusInHome(old, goal, nextStatus)
      );

      await run((config) => api.updateGoal(config, goal.id, { toggle_status: true }), {
        itemId: goal.id,
        flash: { success: "flash.goalUpdated" },
        onError: () => {
          if (prevGoals) queryClient.setQueryData(queryKeys.goals, prevGoals);
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
        },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.goals });
        },
      });
    },
    [run]
  );

  const removeGoal = useCallback(
    (goal: Goal) => {
      confirmDelete(
        `${t("common.delete")}: ${goal.title}?`,
        async () => {
          const prevGoals = queryClient.getQueryData<Goal[]>(queryKeys.goals);
          const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
          queryClient.setQueryData<Goal[]>(queryKeys.goals, (old) =>
            removeItemFromList(old, goal.id)
          );
          queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
            removeGoalFromHome(old, goal.id)
          );
          setGoalForm(null);

          await run((config) => api.deleteGoal(config, goal.id), {
            itemId: goal.id,
            flash: { success: "flash.goalDeleted" },
            onError: () => {
              if (prevGoals) queryClient.setQueryData(queryKeys.goals, prevGoals);
              if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
            },
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: queryKeys.goals });
            },
          });
        },
        t("common.delete"),
        t("common.cancel")
      );
    },
    [run, t]
  );

  const addCommitment = useCallback(async () => {
    if (!commitmentText.trim()) return;
    const text = commitmentText.trim();
    setCommitmentText("");
    await run((config) => api.createCommitment(config, { text }), {
      flash: { success: "flash.commitmentAdded" },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.commitments });
        queryClient.invalidateQueries({ queryKey: queryKeys.home });
      },
    });
  }, [commitmentText, run]);

  const setCommitment = useCallback(
    async (cm: Commitment, status: Commitment["status"]) => {
      const prevCommitments = queryClient.getQueryData<Commitment[]>(queryKeys.commitments);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
      queryClient.setQueryData<Commitment[]>(queryKeys.commitments, (old) =>
        patchItemInList(old, cm.id, { status })
      );
      if (status === "done") {
        queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
          removeCommitmentFromHome(old, cm.id)
        );
      }

      await run((config) => api.setCommitmentStatus(config, cm.id, status), {
        itemId: cm.id,
        flash: { success: "flash.commitmentUpdated" },
        onError: () => {
          if (prevCommitments) queryClient.setQueryData(queryKeys.commitments, prevCommitments);
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
        },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.commitments });
        },
      });
    },
    [run]
  );

  const removeCommitment = useCallback(
    (cm: Commitment) => {
      confirmDelete(
        `${t("common.delete")}?`,
        async () => {
          const prevCommitments = queryClient.getQueryData<Commitment[]>(queryKeys.commitments);
          const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
          queryClient.setQueryData<Commitment[]>(queryKeys.commitments, (old) =>
            removeItemFromList(old, cm.id)
          );
          queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
            removeCommitmentFromHome(old, cm.id)
          );
          await run((config) => api.deleteCommitment(config, cm.id), {
            itemId: cm.id,
            flash: { success: "flash.commitmentDeleted" },
            onError: () => {
              if (prevCommitments) queryClient.setQueryData(queryKeys.commitments, prevCommitments);
              if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
            },
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: queryKeys.commitments });
            },
          });
        },
        t("common.delete"),
        t("common.cancel")
      );
    },
    [run, t]
  );

  const openEditGoal = useCallback((goal: Goal) => {
    setGoalForm({
      id: goal.id,
      title: goal.title,
      category: goal.category ?? "",
      horizon: goal.horizon ?? "",
      first_step: goal.first_step ?? "",
      definition_of_done: goal.definition_of_done ?? "",
    });
  }, []);

  const renderGoal = useCallback(
    ({ item }: { item: Goal }) => (
      <GoalCard
        goal={item}
        busy={isPending(item.id)}
        onPress={openEditGoal}
        onToggleStatus={toggleGoal}
      />
    ),
    [isPending, openEditGoal, toggleGoal]
  );

  const keyExtractor = useCallback((item: Goal) => item.id, []);

  const headerExtra = useMemo(
    () => (
      <View>
        {goalsQ.error ? <ErrorNote message={goalsQ.error} onRetry={goalsQ.refresh} /> : null}
      </View>
    ),
    [goalsQ.error, goalsQ.loading, goalsQ.data, goalsQ.refresh]
  );

  const listFooter = useMemo(
    () => (
      <View style={{ marginTop: 12 }}>
        {done.length > 0 ? (
          <>
            <SectionTitle>{t("goals.fulfilledDreams", { count: done.length })}</SectionTitle>
            {done.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                busy={isPending(g.id)}
                onPress={openEditGoal}
                onToggleStatus={toggleGoal}
              />
            ))}
          </>
        ) : null}

        <SectionTitle>{t("goals.commitmentsTitle")}</SectionTitle>
        <Text style={{ color: c.muted, fontSize: tokens.textSm, textAlign: textStart, writingDirection, marginBottom: 8 }}>
          {t("goals.commitmentsHint")}
        </Text>
        <Card>
          <Input
            value={commitmentText}
            onChangeText={setCommitmentText}
            placeholder={t("goals.commitmentPlaceholder")}
            autoFocus={commitmentFocus}
            onFocus={() => setCommitmentFocus(false)}
          />
          <Btn label={t("common.add")} onPress={addCommitment} disabled={busy || !commitmentText.trim()} />
        </Card>
        {commitmentsQ.error ? <ErrorNote message={commitmentsQ.error} onRetry={commitmentsQ.refresh} /> : null}
        {commitmentsQ.loading && !commitmentsQ.data ? <ListSkeleton count={2} lines={2} /> : null}
        {commitmentsQ.data && commitments.length === 0 ? <EmptyState text={t("goals.noCommitments")} /> : null}
        {[...pending, ...resolved].map((cm) => (
          <CommitmentCard
            key={cm.id}
            commitment={cm}
            busy={isPending(cm.id)}
            onSetStatus={setCommitment}
            onDelete={removeCommitment}
          />
        ))}
      </View>
    ),
    [
      done,
      t,
      isPending,
      toggleGoal,
      c.muted,
      textStart,
      writingDirection,
      commitmentText,
      commitmentFocus,
      addCommitment,
      busy,
      commitmentsQ.data,
      commitmentsQ.error,
      commitmentsQ.loading,
      commitmentsQ.refresh,
      commitments.length,
      pending,
      resolved,
      setCommitment,
      removeCommitment,
    ]
  );

  return (
    <ScreenErrorBoundary name="goals">
    <>
      <ScreenList
        title={t("goals.title")}
        subtitle={t("goals.subtitle")}
        refreshing={goalsQ.isFetching || commitmentsQ.isFetching}
        initialLoading={goalsQ.loading && !goalsQ.data}
        onRefresh={() => {
          goalsQ.refresh();
          commitmentsQ.refresh();
        }}
        headerRight={<Btn small label={t("goals.addNew")} onPress={() => setGoalForm(emptyGoal)} />}
        headerExtra={headerExtra}
        data={active}
        keyExtractor={keyExtractor}
        renderItem={renderGoal}
        ListEmptyComponent={goalsQ.data && active.length === 0 ? <EmptyState text={t("goals.noActive")} /> : null}
        ListFooterComponent={listFooter}
      />

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
    </>
    </ScreenErrorBoundary>
  );
}
