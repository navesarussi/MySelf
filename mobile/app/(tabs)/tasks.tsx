import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
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
import { NEXT_STATUS, TaskCard, taskPriorityLabel, taskStatusLabel } from "../../src/components/task-card";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { ALL_FILTER } from "@/lib/i18n/types";

const STATUSES: TaskStatus[] = ["open", "in_progress", "done"];
const PRIORITIES: TaskPriority[] = ["high", "medium", "low"];

type FormState = {
  id?: string;
  title: string;
  project_id: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string;
  notes: string;
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
  const { textLtr } = useLayoutDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { run, busy } = useMutate();

  const [projectFilter, setProjectFilter] = useState<string>(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string>(ALL_FILTER);
  const [form, setForm] = useState<FormState | null>(null);

  const projectsQ = useApi(api.projects);
  const tasksQ = useApi(
    (config) =>
      api.tasks(config, {
        project: projectFilter !== ALL_FILTER ? projectFilter : undefined,
        status: statusFilter.length ? statusFilter.join(",") : undefined,
        priority: priorityFilter !== ALL_FILTER ? priorityFilter : undefined,
      }),
    [projectFilter, statusFilter.join(","), priorityFilter]
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

  // Done tasks sink to the bottom, like the web board
  const tasks = useMemo(() => {
    const list = tasksQ.data ?? [];
    return [...list.filter((task) => task.status !== "done"), ...list.filter((task) => task.status === "done")];
  }, [tasksQ.data]);

  const statusLabel = (s: TaskStatus) => taskStatusLabel(t, s);
  const priorityLabel = (p: TaskPriority) => taskPriorityLabel(t, p);

  function toggleStatusFilter(s: TaskStatus) {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function submit() {
    if (!form || !form.title.trim() || !form.project_id) return;
    const body = {
      title: form.title,
      project_id: form.project_id,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      notes: form.notes || null,
    };
    if (form.id) await run((config) => api.updateTask(config, form.id!, body), { success: "flash.taskUpdated", error: "flash.taskUpdateError" });
    else await run((config) => api.createTask(config, body), { success: "flash.taskAdded", error: "flash.taskAddError" });
    setForm(null);
    tasksQ.refresh();
  }

  async function advance(task: Task) {
    await run((config) => api.updateTask(config, task.id, { status: NEXT_STATUS[task.status] }), {
      success: "flash.taskUpdated",
    });
    tasksQ.refresh();
  }

  async function toggleDone(task: Task) {
    await run(
      (config) => api.updateTask(config, task.id, { status: task.status === "done" ? "open" : "done" }),
      { success: "flash.taskUpdated" }
    );
    tasksQ.refresh();
  }

  function openEdit(task: Task) {
    setForm({
      id: task.id,
      title: task.title,
      project_id: task.project_id,
      priority: task.priority,
      status: task.status,
      due_date: task.due_date ?? "",
      notes: task.notes ?? "",
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
      headerRight={<Btn small label={`+ ${t("tasks.addTask")}`} onPress={() => setForm(emptyForm(defaultProjectId))} />}
    >
      <Label>{t("nav.projects")}</Label>
      <Row wrap style={{ marginBottom: 8 }}>
        <Chip label={t("common.all")} active={projectFilter === ALL_FILTER} onPress={() => setProjectFilter(ALL_FILTER)} />
        {projects.map((p) => (
          <Chip key={p.id} label={p.name} active={projectFilter === p.id} onPress={() => setProjectFilter(p.id)} />
        ))}
      </Row>
      <Label>{t("common.status")}</Label>
      <Row wrap style={{ marginBottom: 8 }}>
        <Chip label={t("common.all")} active={statusFilter.length === 0} onPress={() => setStatusFilter([])} />
        {STATUSES.map((s) => (
          <Chip key={s} label={statusLabel(s)} active={statusFilter.includes(s)} onPress={() => toggleStatusFilter(s)} />
        ))}
      </Row>
      <Label>{t("tasks.priorityFilter")}</Label>
      <Row wrap style={{ marginBottom: 12 }}>
        <Chip label={t("common.all")} active={priorityFilter === ALL_FILTER} onPress={() => setPriorityFilter(ALL_FILTER)} />
        {PRIORITIES.map((p) => (
          <Chip key={p} label={priorityLabel(p)} active={priorityFilter === p} onPress={() => setPriorityFilter(p)} />
        ))}
      </Row>

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
            <Label>{t("tasks.priorityFilter")}</Label>
            <Row wrap style={{ marginBottom: 8 }}>
              {PRIORITIES.map((p) => (
                <Chip
                  key={p}
                  label={priorityLabel(p)}
                  active={form.priority === p}
                  onPress={() => setForm({ ...form, priority: p })}
                />
              ))}
            </Row>
            <Label>{t("common.status")}</Label>
            <Row wrap style={{ marginBottom: 8 }}>
              {STATUSES.map((s) => (
                <Chip
                  key={s}
                  label={statusLabel(s)}
                  active={form.status === s}
                  onPress={() => setForm({ ...form, status: s })}
                />
              ))}
            </Row>
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
          </View>
        ) : null}
      </FormModal>
    </Screen>
  );
}
