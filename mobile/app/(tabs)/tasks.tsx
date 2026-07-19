import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../src/api/resources";
import { useApi, useMutate } from "../../src/hooks";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import {
  Btn,
  Chip,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Loading,
  Row,
  Screen,
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
import type { Task, TaskExternalMeta, TaskPriority, TaskSource, TaskStatus } from "@/lib/types";
import { ALL_FILTER } from "@/lib/i18n/types";
import { useColors, tokens } from "../../src/theme";

type FormState = {
  id?: string;
  title: string;
  project_id: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string;
  notes: string;
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
  const { run, busy } = useMutate();
  const [filter, setFilter] = useState<TasksFilterState>(defaultTasksFilter);
  const [form, setForm] = useState<FormState | null>(null);
  const listOptionsRef = useRef<Array<{ id: string; title: string }>>([]);

  const projectsQ = useApi(api.projects);
  const tasksQ = useApi(
    (config) =>
      api.tasks(config, {
        project: filter.project !== ALL_FILTER ? filter.project : undefined,
        status: filter.status.length ? filter.status.join(",") : undefined,
        priority: filter.priority.length ? filter.priority.join(",") : undefined,
        source: filter.source !== ALL_FILTER ? filter.source : undefined,
        external_list: filter.externalList !== ALL_FILTER ? filter.externalList : undefined,
        q: filter.q.trim() || undefined,
        overdue: filter.overdue || undefined,
        sort: filter.sort,
      }),
    [
      filter.project,
      filter.status.join(","),
      filter.priority.join(","),
      filter.source,
      filter.externalList,
      filter.q,
      filter.overdue,
      filter.sort,
    ]
  );

  const projects = projectsQ.data ?? [];
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
          notes: form.notes || null,
        };

    if (form.id) {
      await run((config) => api.updateTask(config, form.id!, body), {
        success: "flash.taskUpdated",
        error: "flash.taskUpdateError",
      });
    } else {
      await run((config) => api.createTask(config, body), {
        success: "flash.taskAdded",
        error: "flash.taskAddError",
      });
    }
    setForm(null);
    tasksQ.refresh();
  }

  async function advance(task: Task) {
    await run((config) => api.updateTask(config, task.id, { status: nextStatusForTask(task) }), {
      success: "flash.taskUpdated",
      error: isExternalTask(task) ? "flash.externalTaskUpdateFailed" : "flash.taskUpdateError",
    });
    tasksQ.refresh();
  }

  async function toggleDone(task: Task) {
    const next = task.status === "done" ? "open" : "done";
    await run((config) => api.updateTask(config, task.id, { status: next }), {
      success: "flash.taskUpdated",
      error: isExternalTask(task) ? "flash.externalTaskUpdateFailed" : "flash.taskUpdateError",
    });
    tasksQ.refresh();
  }

  function openEdit(task: Task) {
    setForm({
      id: task.id,
      title: task.title,
      project_id: task.project_id ?? defaultProjectId,
      priority: task.priority,
      status: task.status,
      due_date: task.due_date ?? "",
      notes: task.notes ?? "",
      source: task.source,
      external_meta: task.external_meta,
    });
  }

  function removeTask(task: Task) {
    confirmDelete(
      `${t("common.delete")}: ${task.title}?`,
      async () => {
        await run((config) => api.deleteTask(config, task.id), {
          success: "flash.taskDeleted",
          error: "flash.taskDeleteError",
        });
        setForm(null);
        tasksQ.refresh();
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  return (
    <Screen
      title={t("tasks.title")}
      subtitle={t("tasks.subtitleAlt")}
      refreshing={tasksQ.loading}
      onRefresh={tasksQ.refresh}
      headerRight={
        <Btn small label={`+ ${t("tasks.addTask")}`} onPress={() => setForm(emptyForm(defaultProjectId))} />
      }
    >
      <TasksFilterBar
        value={filter}
        onChange={setFilter}
        projects={projects}
        listOptions={listOptionsRef.current}
      />

      {tasksQ.error ? <ErrorNote message={tasksQ.error} onRetry={tasksQ.refresh} /> : null}
      {tasksQ.loading && !tasksQ.data ? <Loading /> : null}
      {tasksQ.data && tasks.length === 0 ? <EmptyState text={t("tasks.empty")} /> : null}

      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          busy={busy}
          onToggleDone={toggleDone}
          onAdvanceStatus={advance}
          onPress={openEdit}
        />
      ))}

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
                  placeholder={t("tasks.notesPlaceholder")}
                  multiline
                />
              </>
            ) : null}
          </View>
        ) : null}
      </FormModal>
    </Screen>
  );
}
