import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { Btn, Chip, Input, Label, Row } from "./ui";
import { taskPriorityLabel, taskSourceLabel, taskStatusLabel } from "./task-card";
import type { Project, TaskPriority, TaskSource, TaskStatus } from "@/lib/types";
import { ALL_FILTER } from "@/lib/i18n/types";

export const ACTIVE_STATUSES: TaskStatus[] = ["open", "in_progress", "stuck", "review"];
export const ALL_STATUSES: TaskStatus[] = [...ACTIVE_STATUSES, "done"];
export const ALL_PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];
export const SOURCE_FILTERS: Array<typeof ALL_FILTER | TaskSource> = [
  ALL_FILTER,
  "manual",
  "google_tasks",
  "monday",
  "github",
];

export type TaskSort = "priority" | "due_date" | "updated_at";

export type TasksFilterState = {
  q: string;
  project: string;
  status: TaskStatus[];
  priority: TaskPriority[];
  source: typeof ALL_FILTER | TaskSource;
  externalList: string;
  overdue: boolean;
  sort: TaskSort;
};

export function defaultTasksFilter(): TasksFilterState {
  return {
    q: "",
    project: ALL_FILTER,
    status: [...ACTIVE_STATUSES],
    priority: [],
    source: ALL_FILTER,
    externalList: ALL_FILTER,
    overdue: false,
    sort: "priority",
  };
}

export function TasksFilterBar({
  value,
  onChange,
  projects,
  listOptions,
}: {
  value: TasksFilterState;
  onChange: (next: TasksFilterState) => void;
  projects: Project[];
  listOptions: Array<{ id: string; title: string }>;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [open, setOpen] = useState(false);

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (value.source !== ALL_FILTER) {
      chips.push({
        key: "source",
        label: taskSourceLabel(t, value.source),
        clear: () => onChange({ ...value, source: ALL_FILTER, externalList: ALL_FILTER }),
      });
    }
    if (value.project !== ALL_FILTER) {
      const name = projects.find((p) => p.id === value.project)?.name ?? value.project;
      chips.push({
        key: "project",
        label: name,
        clear: () => onChange({ ...value, project: ALL_FILTER }),
      });
    }
    if (value.priority.length > 0) {
      chips.push({
        key: "priority",
        label: value.priority.map((p) => taskPriorityLabel(t, p)).join(", "),
        clear: () => onChange({ ...value, priority: [] }),
      });
    }
    if (value.overdue) {
      chips.push({
        key: "overdue",
        label: t("tasks.overdueOnly"),
        clear: () => onChange({ ...value, overdue: false }),
      });
    }
    const isDefaultStatus =
      value.status.length === ACTIVE_STATUSES.length &&
      ACTIVE_STATUSES.every((s) => value.status.includes(s));
    if (!isDefaultStatus) {
      chips.push({
        key: "status",
        label:
          value.status.length === 0
            ? t("common.all")
            : value.status.map((s) => taskStatusLabel(t, s)).join(", "),
        clear: () => onChange({ ...value, status: [...ACTIVE_STATUSES] }),
      });
    }
    if (value.externalList !== ALL_FILTER) {
      const title =
        listOptions.find((l) => l.id === value.externalList)?.title ?? value.externalList;
      chips.push({
        key: "list",
        label: title,
        clear: () => onChange({ ...value, externalList: ALL_FILTER }),
      });
    }
    return chips;
  }, [value, projects, listOptions, t, onChange]);

  function toggleStatus(s: TaskStatus) {
    const next = value.status.includes(s)
      ? value.status.filter((x) => x !== s)
      : [...value.status, s];
    onChange({ ...value, status: next });
  }

  function togglePriority(p: TaskPriority) {
    const next = value.priority.includes(p)
      ? value.priority.filter((x) => x !== p)
      : [...value.priority, p];
    onChange({ ...value, priority: next });
  }

  const showLists =
    (value.source === "google_tasks" ||
      value.source === "monday" ||
      value.source === "github") &&
    listOptions.length > 0;

  return (
    <View style={{ marginBottom: 10 }}>
      <Row style={{ marginBottom: 8, gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Input
            value={value.q}
            onChangeText={(q) => onChange({ ...value, q })}
            placeholder={t("tasks.searchPlaceholder")}
          />
        </View>
        <Btn small label={t("tasks.filters")} onPress={() => setOpen(true)} />
      </Row>

      {activeChips.length ? (
        <Row wrap style={{ marginBottom: 4 }}>
          {activeChips.map((chip) => (
            <Chip key={chip.key} label={`× ${chip.label}`} active onPress={chip.clear} />
          ))}
        </Row>
      ) : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: c.surface,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderColor: c.border,
              borderWidth: 1,
              maxHeight: "85%",
            }}
          >
            <ScrollView contentContainerStyle={{ padding: tokens.padLg }}>
              <Text
                style={{
                  color: c.ink,
                  fontSize: 17,
                  fontWeight: "700",
                  textAlign: textStart,
                  writingDirection,
                  marginBottom: 12,
                }}
              >
                {t("tasks.filters")}
              </Text>

              <Label>{t("tasks.sourceFilter")}</Label>
              <Row wrap style={{ marginBottom: 10 }}>
                {SOURCE_FILTERS.map((s) => (
                  <Chip
                    key={s}
                    label={s === ALL_FILTER ? t("common.all") : taskSourceLabel(t, s)}
                    active={value.source === s}
                    onPress={() =>
                      onChange({
                        ...value,
                        source: s,
                        externalList: ALL_FILTER,
                      })
                    }
                  />
                ))}
              </Row>

              {showLists ? (
                <>
                  <Label>{t("tasks.listFilter")}</Label>
                  <Row wrap style={{ marginBottom: 10 }}>
                    <Chip
                      label={t("tasks.filterAllLists")}
                      active={value.externalList === ALL_FILTER}
                      onPress={() => onChange({ ...value, externalList: ALL_FILTER })}
                    />
                    {listOptions.map((list) => (
                      <Chip
                        key={list.id}
                        label={list.title}
                        active={value.externalList === list.id}
                        onPress={() => onChange({ ...value, externalList: list.id })}
                      />
                    ))}
                  </Row>
                </>
              ) : null}

              <Label>{t("nav.projects")}</Label>
              <Row wrap style={{ marginBottom: 10 }}>
                <Chip
                  label={t("common.all")}
                  active={value.project === ALL_FILTER}
                  onPress={() => onChange({ ...value, project: ALL_FILTER })}
                />
                {projects.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    active={value.project === p.id}
                    onPress={() => onChange({ ...value, project: p.id })}
                  />
                ))}
              </Row>

              <Label>{t("common.status")}</Label>
              <Row wrap style={{ marginBottom: 10 }}>
                {ALL_STATUSES.map((s) => (
                  <Chip
                    key={s}
                    label={taskStatusLabel(t, s)}
                    active={value.status.includes(s)}
                    onPress={() => toggleStatus(s)}
                  />
                ))}
              </Row>

              <Label>{t("tasks.priorityFilter")}</Label>
              <Row wrap style={{ marginBottom: 10 }}>
                <Chip
                  label={t("common.all")}
                  active={value.priority.length === 0}
                  onPress={() => onChange({ ...value, priority: [] })}
                />
                {ALL_PRIORITIES.map((p) => (
                  <Chip
                    key={p}
                    label={taskPriorityLabel(t, p)}
                    active={value.priority.includes(p)}
                    onPress={() => togglePriority(p)}
                  />
                ))}
              </Row>

              <Label>{t("tasks.sort")}</Label>
              <Row wrap style={{ marginBottom: 10 }}>
                {(
                  [
                    ["priority", "tasks.sortPriority"],
                    ["due_date", "tasks.sortDue"],
                    ["updated_at", "tasks.sortUpdated"],
                  ] as const
                ).map(([id, key]) => (
                  <Chip
                    key={id}
                    label={t(key)}
                    active={value.sort === id}
                    onPress={() => onChange({ ...value, sort: id })}
                  />
                ))}
              </Row>

              <Row wrap style={{ marginBottom: 16 }}>
                <Chip
                  label={t("tasks.overdueOnly")}
                  active={value.overdue}
                  onPress={() => onChange({ ...value, overdue: !value.overdue })}
                />
              </Row>

              <Row>
                <Btn
                  label={t("tasks.clearFilters")}
                  variant="ghost"
                  onPress={() => onChange(defaultTasksFilter())}
                />
                <View style={{ flex: 1 }} />
                <Btn label={t("common.done")} onPress={() => setOpen(false)} />
              </Row>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
