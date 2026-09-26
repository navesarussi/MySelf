import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../src/api/resources";
import { useI18n } from "../../src/i18n";
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
import { Btn, EmptyState, ErrorNote, Screen, ScreenList, confirmDelete } from "../../src/components/ui";
import { TaskEditSheet, type TaskEditFormState } from "../../src/components/task-edit-sheet";
import { isExternalTask, nextStatusForTask, TaskCard } from "../../src/components/task-card";
import { defaultTasksFilter, TasksFilterBar, type TasksFilterState } from "../../src/components/tasks-filter-bar";
import type { Project, Task } from "@/lib/types";
import { ALL_FILTER } from "@/lib/i18n/types";
import { useToast } from "../../src/toast";
import {
  isLocalOnlyAllowed,
  isLocalOnlyPayload,
  readApiError,
  taskDeleteErrorFlash,
  taskLocalOnlyWarningFlash,
  taskUpdateErrorFlash,
} from "../../src/task-errors";

/** Stable while loading, so the default-project memo does not rerun every render. */
const NO_PROJECTS: Project[] = [];

const emptyForm = (projectId: string): TaskEditFormState => ({
  title: "",
  project_id: projectId,
  priority: "medium",
  status: "open",
  due_date: "",
  notes: "",
});

export default function TasksScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { run, isPending, busy } = useApiMutation();
  const { show: showToast } = useToast();
  const [filter, setFilter] = useState<TasksFilterState>(defaultTasksFilter);
  const [debouncedQ, setDebouncedQ] = useState(filter.q);
  const [form, setForm] = useState<TaskEditFormState | null>(null);
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
  const hideTaskLocally = useCallback(
    async (taskId: string) => {
      const prevTasks = queryClient.getQueryData<Task[]>(tasksQueryKey);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
      queryClient.setQueryData<Task[]>(tasksQueryKey, (old) => removeItemFromList(old, taskId));
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => removeTaskFromHome(old, taskId));
      setForm(null);

      await run((config) => api.updateTask(config, taskId, { hide_locally: true }), {
        itemId: taskId,
        flash: { success: "flash.taskHidden" },
        onError: () => {
          if (prevTasks) queryClient.setQueryData(tasksQueryKey, prevTasks);
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
        },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.tasksAll });
        },
      });
    },
    [run, tasksQueryKey]
  );

  const applyUpdate = useCallback(
    async (targetId: string, body: Record<string, unknown>, forceLocal = false) => {
      await run(
        (config) => api.updateTask(config, targetId, { ...body, force_local: forceLocal || undefined }),
        {
          itemId: targetId,
          suppressErrorToast: true,
          flash: { success: "flash.taskUpdated", when: "immediate" },
          onSuccess: (updated) => {
            if (updated) {
              queryClient.setQueryData<Task[]>(tasksQueryKey, (old) =>
                patchItemInList(old, targetId, updated as Task)
              );
              queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
                patchTaskInHome(old, targetId, updated as Task)
              );
              if (isLocalOnlyPayload(updated)) {
                const warn = taskLocalOnlyWarningFlash(updated);
                showToast(warn.startsWith("flash.") ? t(warn) : warn, "error");
              }
            }
            queryClient.invalidateQueries({ queryKey: queryKeys.tasksAll });
          },
          onError: (err) => {
            const msg = readApiError(err);
            if (isLocalOnlyAllowed(err)) {
              Alert.alert(t("tasks.externalActionTitle"), msg ?? t("flash.taskUpdateError"), [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("tasks.saveLocallyOnly"),
                  onPress: () => void applyUpdate(targetId, body, true),
                },
                {
                  text: t("tasks.hideLocally"),
                  onPress: () => void hideTaskLocally(targetId),
                },
              ]);
              return;
            }
            const task = tasks.find((x) => x.id === targetId);
            showToast(t(task ? taskUpdateErrorFlash(task, msg) : "flash.taskUpdateError"), "error");
          },
        }
      );
    },
    [run, showToast, t, tasks, tasksQueryKey, hideTaskLocally]
  );

  async function submit() {
    if (!form) return;
    const external = form.id ? isExternalTask({ source: form.source ?? "manual" }) : false;
    if (!external && (!form.title.trim() || !form.project_id)) return;

    const body: Record<string, unknown> = external
      ? {
          priority: form.priority,
          status: form.status,
          ...(form.mondayStatusIndex != null
            ? { monday_status_index: form.mondayStatusIndex }
            : {}),
          ...(form.external_list_id && form.external_list_id !== tasks.find((x) => x.id === form.id)?.external_list_id
            ? { external_list_id: form.external_list_id }
            : {}),
          ...(form.title.trim() ? { title: form.title.trim() } : {}),
          ...(form.notesLoading ? {} : { notes: form.notes || null }),
          ...(form.due_date !== undefined ? { due_date: form.due_date || null } : {}),
        }
      : {
          title: form.title,
          project_id: form.project_id,
          priority: form.priority,
          status: form.status,
          due_date: form.due_date || null,
          ...(form.notesLoading ? {} : { notes: form.notes || null }),
        };

    const targetId = form.id;
    setForm(null);

    if (targetId) {
      await applyUpdate(targetId, body);
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
        mondayStatusIndex: task.external_meta?.statusLabelIndex ?? null,
        due_date: task.due_date ?? "",
        notes: task.notes ?? "",
        notesLoading: needsFullNotes,
        source: task.source,
        external_meta: task.external_meta,
        external_list_id: task.external_list_id,
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

  const performDelete = useCallback(
    async (task: Task, opts?: { forceLocal?: boolean; hideLocally?: boolean }) => {
      const prevTasks = queryClient.getQueryData<Task[]>(tasksQueryKey);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);

      queryClient.setQueryData<Task[]>(tasksQueryKey, (old) => removeItemFromList(old, task.id));
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => removeTaskFromHome(old, task.id));
      setForm(null);

      await run((config) => api.deleteTask(config, task.id, opts), {
        itemId: task.id,
        suppressErrorToast: true,
        flash: { success: "flash.taskDeleted" },
        onError: (err) => {
          if (prevTasks) queryClient.setQueryData(tasksQueryKey, prevTasks);
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
          const msg = readApiError(err);
          if (isLocalOnlyAllowed(err)) {
            Alert.alert(t("tasks.externalActionTitle"), msg ?? t("flash.taskDeleteError"), [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("tasks.saveLocallyOnly"),
                onPress: () => void performDelete(task, { forceLocal: true }),
              },
              {
                text: t("tasks.hideLocally"),
                onPress: () => void performDelete(task, { hideLocally: true }),
              },
            ]);
            return;
          }
          showToast(t(taskDeleteErrorFlash(task, msg)), "error");
        },
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: queryKeys.tasksAll });
          if (isLocalOnlyPayload(result)) {
            showToast(t(taskLocalOnlyWarningFlash(result)), "error");
          }
        },
      });
    },
    [run, showToast, t, tasksQueryKey]
  );

  function removeTask(task: Task) {
    confirmDelete(
      `${t("common.delete")}: ${task.title}?`,
      () => void performDelete(task),
      t("common.delete"),
      t("common.cancel")
    );
  }

  const copyToManual = useCallback(
    async (taskId: string, projectId: string) => {
      await run((config) => api.copyTask(config, taskId, { project_id: projectId }), {
        flash: { success: "flash.taskCopied" },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.tasksAll });
          queryClient.invalidateQueries({ queryKey: queryKeys.home });
          setForm(null);
        },
      });
    },
    [run]
  );

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

      <TaskEditSheet
        form={form}
        projects={projects}
        listOptions={listOptionsRef.current}
        busy={busy}
        onClose={() => setForm(null)}
        onSubmit={submit}
        onDelete={
          form?.id
            ? () => {
                const task = tasks.find((x) => x.id === form.id);
                if (task) removeTask(task);
              }
            : undefined
        }
        onHideLocally={
          form?.id ? () => void hideTaskLocally(form.id!) : undefined
        }
        onCopyToManual={
          form?.id
            ? () => void copyToManual(form.id!, form.project_id || defaultProjectId)
            : undefined
        }
        onChange={setForm}
      />
    </>
    </ScreenErrorBoundary>
  );
}
