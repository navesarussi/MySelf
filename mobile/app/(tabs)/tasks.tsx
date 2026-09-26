import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../src/api/resources";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import {
  useApiQuery,
  useApiMutation,
  queryKeys,
  queryClient,
  patchItemInList,
  removeItemFromList,
  patchTaskInHome,
  removeTaskFromHome,
} from "../../src/query";
import type { HomePayload } from "../../src/api/resources";
import { ScreenErrorBoundary } from "../../src/components/error-boundary";
import {
  Btn,
  Chip,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Row,
  Screen,
  ScreenList,
  confirmDelete,
} from "../../src/components/ui";
import { FormModal } from "../../src/components/form-modal";
import {
  isExternalTask,
  nextStatusForTask,
  TaskCard,
  taskPriorityLabel,
  taskStatusLabel,
} from "../../src/components/task-card";
import {
  ALL_PRIORITIES,
  ALL_STATUSES,
  defaultTasksFilter,
  TasksFilterBar,
  type TasksFilterState,
} from "../../src/components/tasks-filter-bar";
import type { Project, Task, TaskExternalMeta, TaskPriority, TaskSource, TaskStatus } from "@/lib/types";
import { ALL_FILTER } from "@/lib/i18n/types";
import { useColors, tokens } from "../../src/theme";
import { useToast } from "../../src/toast";
import {
  isLocalOnlyPayload,
  readApiError,
  taskDeleteErrorFlash,
  taskLocalOnlyWarningFlash,
  taskUpdateErrorFlash,
} from "../../src/task-errors";

/** Stable while loading, so the default-project memo does not rerun every render. */
const NO_PROJECTS: Project[] = [];

type FormState = {
  id?: string;
  title: string;
  project_id: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string;
  notes: string;
  /** True while the full note is being fetched because the list sent a preview. */
  notesLoading?: boolean;
  source?: TaskSource;
  external_meta?: TaskExternalMeta;
};

const emptyForm = (projectId: string): FormState => ({
  title: "",
  project_id: projectId,
  priority: "medium",
  status: "open",
  due_date: "",
  notes: "",
});

export default function TasksScreen() {
  const { t } = useI18n();
  const c = useColors();
  const { textLtr, textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { run, isPending, busy } = useApiMutation();
  const { show: showToast } = useToast();
  const [filter, setFilter] = useState<TasksFilterState>(defaultTasksFilter);
  const [debouncedQ, setDebouncedQ] = useState(filter.q);
  const [form, setForm] = useState<FormState | null>(null);
  const listOptionsRef = useRef<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(filter.q);
    }, 300);
    return () => clearTimeout(timer);
  }, [filter.q]);

  const activeParams = useMemo(
    () => ({
      project: filter.project !== ALL_FILTER ? filter.project : undefined,
      status: filter.status.length ? filter.status.join(",") : undefined,
      priority: filter.priority.length ? filter.priority.join(",") : undefined,
      source: filter.source !== ALL_FILTER ? filter.source : undefined,
      external_list: filter.externalList !== ALL_FILTER ? filter.externalList : undefined,
      q: debouncedQ.trim() || undefined,
      overdue: filter.overdue || undefined,
      sort: filter.sort,
    }),
    [
      filter.project,
      filter.status,
      filter.priority,
      filter.source,
      filter.externalList,
      debouncedQ,
      filter.overdue,
      filter.sort,
    ]
  );

  const tasksQueryKey = useMemo(() => queryKeys.tasks(activeParams), [activeParams]);
  const projectsQ = useApiQuery(queryKeys.projects, api.projects);
  const tasksQ = useApiQuery(tasksQueryKey, (config) => api.tasks(config, activeParams));

  const projects = projectsQ.data ?? NO_PROJECTS;
  const defaultProjectId = useMemo(
    () => projects.find((p) => p.name === "אישי")?.id ?? projects[0]?.id ?? "",
    [projects]
  );

  useEffect(() => {
    if ((params.add === "task" || params.add === "1") && projects.length) {
      setForm(emptyForm(defaultProjectId));
      router.setParams({ add: "" });
    }
  }, [params.add, projects.length, defaultProjectId, router]);

  useEffect(() => {
    if (
      filter.source !== "google_tasks" &&
      filter.source !== "monday" &&
      filter.source !== "github"
    ) {
      if (filter.externalList !== ALL_FILTER) {
        setFilter((prev) => ({ ...prev, externalList: ALL_FILTER }));
      }
      return;
    }
    if (filter.externalList !== ALL_FILTER) return;
    const map = new Map<string, string>();
    for (const task of tasksQ.data ?? []) {
      if (task.external_list_id) {
        map.set(task.external_list_id, task.external_meta?.listTitle ?? task.external_list_id);
      }
    }
    if (map.size) {
      listOptionsRef.current = [...map.entries()].map(([id, title]) => ({ id, title }));
    }
  }, [tasksQ.data, filter.source, filter.externalList]);

  const tasks = tasksQ.data ?? [];
  const isEditingExternal = form?.id ? isExternalTask({ source: form.source ?? "manual" }) : false;

  async function submit() {
    if (!form) return;
    const external = form.id ? isExternalTask({ source: form.source ?? "manual" }) : false;
    if (!external && (!form.title.trim() || !form.project_id)) return;

    const body = external
      ? { priority: form.priority, status: form.status }
      : {
          title: form.title,
          project_id: form.project_id,
          priority: form.priority,
          status: form.status,
          due_date: form.due_date || null,
          // Omitted while loading: the field still holds a preview, and a
          // partial update leaves the stored note untouched.
          ...(form.notesLoading ? {} : { notes: form.notes || null }),
        };

    const targetId = form.id;
    setForm(null);

    if (targetId) {
      await run((config) => api.updateTask(config, targetId, body), {
        itemId: targetId,
        flash: {
          success: "flash.taskUpdated",
          error: "flash.taskUpdateError",
        },
        onSuccess: (updated) => {
          if (updated) {
            queryClient.setQueryData<Task[]>(tasksQueryKey, (old) =>
              patchItemInList(old, targetId, updated)
            );
            queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
              patchTaskInHome(old, targetId, updated)
            );
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.tasksAll });
        },
      });
    } else {
      await run((config) => api.createTask(config, body), {
        flash: {
          success: "flash.taskAdded",
          error: "flash.taskAddError",
        },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.tasksAll });
          queryClient.invalidateQueries({ queryKey: queryKeys.home });
        },
      });
    }
  }

  const advance = useCallback(
    async (task: Task) => {
      const next = nextStatusForTask(task);
      const prevTasks = queryClient.getQueryData<Task[]>(tasksQueryKey);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);

      queryClient.setQueryData<Task[]>(tasksQueryKey, (old) =>
        patchItemInList(old, task.id, { status: next })
      );
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
        patchTaskInHome(old, task.id, { status: next })
      );

      await run((config) => api.updateTask(config, task.id, { status: next }), {
        itemId: task.id,
        suppressErrorToast: true,
        flash: {
          success: "flash.taskUpdated",
          when: "immediate",
        },
        onError: (err) => {
          if (prevTasks) queryClient.setQueryData(tasksQueryKey, prevTasks);
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
          showToast(t(taskUpdateErrorFlash(task, readApiError(err))), "error");
        },
        onSuccess: (updated) => {
          if (updated) {
            queryClient.setQueryData<Task[]>(tasksQueryKey, (old) =>
              patchItemInList(old, task.id, updated as Task)
            );
            queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
              patchTaskInHome(old, task.id, updated as Task)
            );
            if (isLocalOnlyPayload(updated)) {
              showToast(t(taskLocalOnlyWarningFlash(updated)), "error");
            }
          }
        },
      });
    },
    [tasksQueryKey, run, showToast, t]
  );

  const toggleDone = useCallback(
    async (task: Task) => {
      const next = task.status === "done" ? "open" : "done";
      const prevTasks = queryClient.getQueryData<Task[]>(tasksQueryKey);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);

      queryClient.setQueryData<Task[]>(tasksQueryKey, (old) =>
        patchItemInList(old, task.id, { status: next })
      );
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
        patchTaskInHome(old, task.id, { status: next })
      );

      await run((config) => api.updateTask(config, task.id, { status: next }), {
        itemId: task.id,
        suppressErrorToast: true,
        flash: {
          success: "flash.taskUpdated",
          when: "immediate",
        },
        onError: (err) => {
          if (prevTasks) queryClient.setQueryData(tasksQueryKey, prevTasks);
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
          showToast(t(taskUpdateErrorFlash(task, readApiError(err))), "error");
        },
        onSuccess: (updated) => {
          if (updated) {
            queryClient.setQueryData<Task[]>(tasksQueryKey, (old) =>
              patchItemInList(old, task.id, updated as Task)
            );
            queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
              patchTaskInHome(old, task.id, updated as Task)
            );
            if (isLocalOnlyPayload(updated)) {
              showToast(t(taskLocalOnlyWarningFlash(updated)), "error");
            }
          }
        },
      });
    },
    [tasksQueryKey, run, showToast, t]
  );

  const openEdit = useCallback(
    (task: Task) => {
      const needsFullNotes = Boolean(task.notes_truncated);
      setForm({
        id: task.id,
        title: task.title,
        project_id: task.project_id ?? defaultProjectId,
        priority: task.priority,
        status: task.status,
        due_date: task.due_date ?? "",
        notes: task.notes ?? "",
        notesLoading: needsFullNotes,
        source: task.source,
        external_meta: task.external_meta,
      });

      // The list only carries a preview. Pull the full note before the field
      // becomes editable, so a save can never write the truncation back.
      if (!needsFullNotes) return;
      void (async () => {
        try {
          const full = await run((config) => api.task(config, task.id));
          setForm((prev) =>
            prev && prev.id === task.id
              ? { ...prev, notes: full?.notes ?? prev.notes, notesLoading: false }
              : prev
          );
        } catch {
          setForm((prev) =>
            prev && prev.id === task.id ? { ...prev, notesLoading: false } : prev
          );
        }
      })();
    },
    [defaultProjectId, run]
  );

  function removeTask(task: Task) {
    confirmDelete(
      `${t("common.delete")}: ${task.title}?`,
      async () => {
        const prevTasks = queryClient.getQueryData<Task[]>(tasksQueryKey);
        const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);

        queryClient.setQueryData<Task[]>(tasksQueryKey, (old) =>
          removeItemFromList(old, task.id)
        );
        queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
          removeTaskFromHome(old, task.id)
        );
        setForm(null);

        await run((config) => api.deleteTask(config, task.id), {
          itemId: task.id,
          suppressErrorToast: true,
          flash: {
            success: "flash.taskDeleted",
          },
          onError: (err) => {
            if (prevTasks) queryClient.setQueryData(tasksQueryKey, prevTasks);
            if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
            showToast(t(taskDeleteErrorFlash(task, readApiError(err))), "error");
          },
          onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tasksAll });
            if (isLocalOnlyPayload(result)) {
              showToast(t(taskLocalOnlyWarningFlash(result)), "error");
            }
          },
        });
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  const renderItem = useCallback(
    ({ item }: { item: Task }) => (
      <TaskCard
        task={item}
        busy={isPending(item.id)}
        onToggleDone={toggleDone}
        onAdvanceStatus={advance}
        onPress={openEdit}
      />
    ),
    [isPending, toggleDone, advance, openEdit]
  );

  const keyExtractor = useCallback((item: Task) => item.id, []);

  const listHeader = useMemo(
    () => (
      <View>
        <TasksFilterBar
          value={filter}
          onChange={setFilter}
          projects={projects}
          listOptions={listOptionsRef.current}
        />
        {tasksQ.error ? <ErrorNote message={tasksQ.error} onRetry={tasksQ.refresh} /> : null}
      </View>
    ),
    [filter, projects, tasksQ.error, tasksQ.loading, tasksQ.data, tasksQ.refresh]
  );

  return (
    <ScreenErrorBoundary name="tasks">
    <>
      <ScreenList
        title={t("tasks.title")}
        subtitle={t("tasks.subtitleAlt")}
        refreshing={tasksQ.isFetching}
        onRefresh={tasksQ.refresh}
        initialLoading={tasksQ.loading && !tasksQ.data}
        headerRight={
          <Btn small label={`+ ${t("tasks.addTask")}`} onPress={() => setForm(emptyForm(defaultProjectId))} />
        }
        headerExtra={listHeader}
        data={tasks}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={tasksQ.data && tasks.length === 0 ? <EmptyState text={t("tasks.empty")} /> : null}
      />

      <FormModal
        visible={form !== null}
        title={form?.id ? t("tasks.editTask") : t("tasks.addTask")}
        onClose={() => setForm(null)}
        onSubmit={submit}
        submitLabel={form?.id ? t("tasks.saveChanges") : t("common.add")}
        busy={busy}
        onDelete={
          form?.id
            ? () => {
                const task = tasks.find((x) => x.id === form.id);
                if (task) removeTask(task);
              }
            : undefined
        }
      >
        {form ? (
          <View>
            {isEditingExternal ? (
              <>
                <Text
                  style={{
                    color: c.ink,
                    fontWeight: "600",
                    fontSize: tokens.textSm,
                    textAlign: textStart,
                    writingDirection,
                    marginBottom: 4,
                  }}
                >
                  {form.title}
                </Text>
                {form.external_meta?.listTitle ? (
                  <Text
                    style={{
                      color: c.muted,
                      fontSize: tokens.textSm,
                      textAlign: textStart,
                      writingDirection,
                      marginBottom: 8,
                    }}
                  >
                    {form.external_meta.listTitle}
                  </Text>
                ) : null}
                <Text
                  style={{
                    color: c.muted,
                    fontSize: tokens.textXs,
                    textAlign: textStart,
                    writingDirection,
                    marginBottom: 12,
                  }}
                >
                  {t("tasks.externalReadonlyHint")}
                </Text>
              </>
            ) : (
              <>
                <Input
                  value={form.title}
                  onChangeText={(v) => setForm({ ...form, title: v })}
                  placeholder={t("tasks.titlePlaceholder")}
                />
                <Label>{t("nav.projects")}</Label>
                <Row wrap style={{ marginBottom: 8 }}>
                  {projects.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.name}
                      active={form.project_id === p.id}
                      onPress={() => setForm({ ...form, project_id: p.id })}
                    />
                  ))}
                </Row>
              </>
            )}
            <Label>{t("tasks.priorityFilter")}</Label>
            <Row wrap style={{ marginBottom: 8 }}>
              {ALL_PRIORITIES.map((p) => (
                <Chip
                  key={p}
                  label={taskPriorityLabel(t, p)}
                  active={form.priority === p}
                  onPress={() => setForm({ ...form, priority: p })}
                />
              ))}
            </Row>
            <Label>{t("common.status")}</Label>
            <Row wrap style={{ marginBottom: 8 }}>
              {ALL_STATUSES.map((s) => (
                <Chip
                  key={s}
                  label={taskStatusLabel(t, s)}
                  active={form.status === s}
                  onPress={() => setForm({ ...form, status: s })}
                />
              ))}
            </Row>
            {!isEditingExternal ? (
              <>
                <Label>{`${t("common.due")} (YYYY-MM-DD)`}</Label>
                <Input
                  value={form.due_date}
                  onChangeText={(v) => setForm({ ...form, due_date: v })}
                  placeholder="2026-12-31"
                  autoCapitalize="none"
                  style={{ textAlign: textLtr }}
                />
                <Input
                  value={form.notes}
                  onChangeText={(v) => setForm({ ...form, notes: v })}
                  placeholder={
                    form.notesLoading ? t("common.loading") : t("tasks.notesPlaceholder")
                  }
                  editable={!form.notesLoading}
                  multiline
                />
              </>
            ) : null}
          </View>
        ) : null}
      </FormModal>
    </>
    </ScreenErrorBoundary>
  );
}
