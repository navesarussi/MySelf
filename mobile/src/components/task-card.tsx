import React from "react";
import { Pressable, Text, View } from "react-native";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { Badge, Btn, Card, Row } from "./ui";
import type { Task, TaskPriority, TaskSource, TaskStatus } from "@/lib/types";

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
};

export function isExternalTask(task: Pick<Task, "source">) {
  return task.source !== "manual";
}

export function nextStatusForTask(task: Task): TaskStatus {
  if (isExternalTask(task)) return task.status === "done" ? "open" : "done";
  return NEXT_STATUS[task.status];
}

export function taskSourceLabel(t: (key: string) => string, source: TaskSource) {
  return source === "google_tasks" ? t("tasks.source.google_tasks") : t("tasks.source.manual");
}

export function taskStatusLabel(t: (key: string) => string, s: TaskStatus) {
  return s === "open" ? t("common.open") : s === "in_progress" ? t("common.inProgress") : t("common.done");
}

export function taskPriorityLabel(t: (key: string) => string, p: TaskPriority) {
  return p === "high" ? t("common.high") : p === "medium" ? t("common.medium") : t("common.low");
}

export function TaskCard({
  task,
  onToggleDone,
  onAdvanceStatus,
  onPress,
  busy,
}: {
  task: Task;
  onToggleDone: (task: Task) => void;
  onAdvanceStatus?: (task: Task) => void;
  onPress?: (task: Task) => void;
  busy?: boolean;
}) {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const done = task.status === "done";

  const Body = (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          color: c.ink,
          textAlign: textStart, writingDirection,
          fontWeight: "600",
          textDecorationLine: done ? "line-through" : "none",
        }}
      >
        {task.title}
      </Text>
      {isExternalTask(task) && task.external_meta?.listTitle ? (
        <Text
          style={{
            color: c.muted,
            fontSize: tokens.textXs,
            textAlign: textStart,
            writingDirection,
            marginTop: 2,
          }}
        >
          {task.external_meta.listTitle}
        </Text>
      ) : null}
      <Row style={{ marginTop: 4 }} wrap>
        {task.project_name ? <Badge label={task.project_name} /> : null}
        {isExternalTask(task) ? (
          <Badge label={taskSourceLabel(t, task.source)} tone="accent" />
        ) : null}
        <Badge
          label={taskPriorityLabel(t, task.priority)}
          tone={task.priority === "high" ? "warn" : task.priority === "medium" ? "accent" : "default"}
        />
        {task.due_date ? <Badge label={`${t("common.due")}: ${task.due_date}`} /> : null}
      </Row>
      {task.notes ? (
        <Text
          style={{
            color: c.muted,
            fontSize: tokens.textXs,
            textAlign: textStart, writingDirection,
            marginTop: 4,
          }}
        >
          {task.notes}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Card style={{ opacity: done ? 0.55 : 1 }}>
      <Row>
        <Btn
          small
          label={t("common.done")}
          variant={done ? "ghost" : "primary"}
          disabled={busy}
          onPress={() => onToggleDone(task)}
        />
        {onPress ? (
          <Pressable style={{ flex: 1 }} onPress={() => onPress(task)}>
            {Body}
          </Pressable>
        ) : (
          Body
        )}
        <Pressable onPress={() => onAdvanceStatus?.(task)} disabled={busy || !onAdvanceStatus}>
          <Badge
            label={taskStatusLabel(t, task.status)}
            tone={done ? "good" : task.status === "in_progress" ? "accent" : "default"}
          />
        </Pressable>
      </Row>
    </Card>
  );
}

export { NEXT_STATUS };
