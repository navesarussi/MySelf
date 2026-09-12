import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { Badge, Card, Row } from "./ui";
import { hapticImpact, hapticSelection } from "../haptics";
import type { Task, TaskPriority, TaskSource, TaskStatus } from "@/lib/types";

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  open: "in_progress",
  in_progress: "stuck",
  stuck: "review",
  review: "done",
  done: "open",
};

export function isExternalTask(task: Pick<Task, "source">) {
  return task.source !== "manual";
}

export function nextStatusForTask(task: Task): TaskStatus {
  return NEXT_STATUS[task.status];
}

export function taskSourceLabel(t: (key: string) => string, source: TaskSource) {
  if (source === "google_tasks") return t("tasks.source.google_tasks");
  if (source === "gmail") return t("tasks.source.gmail");
  if (source === "monday") return t("tasks.source.monday");
  if (source === "github") return t("tasks.source.github");
  return t("tasks.source.manual");
}

export function taskStatusLabel(t: (key: string) => string, s: TaskStatus) {
  if (s === "open") return t("common.open");
  if (s === "in_progress") return t("common.inProgress");
  if (s === "stuck") return t("common.stuck");
  if (s === "review") return t("common.review");
  return t("common.done");
}

export function taskPriorityLabel(t: (key: string) => string, p: TaskPriority) {
  if (p === "urgent") return t("common.urgent");
  if (p === "high") return t("common.high");
  if (p === "medium") return t("common.medium");
  return t("common.low");
}

function priorityTone(p: TaskPriority): "warn" | "accent" | "default" {
  if (p === "urgent" || p === "high") return "warn";
  if (p === "medium") return "accent";
  return "default";
}

function statusTone(s: TaskStatus): "good" | "accent" | "warn" | "default" {
  if (s === "done") return "good";
  if (s === "stuck") return "warn";
  if (s === "in_progress" || s === "review") return "accent";
  return "default";
}

export const TaskCard = React.memo(function TaskCard({
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

  const titleBlock = (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          color: c.ink,
          textAlign: textStart,
          writingDirection,
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
      {task.notes ? (
        <Text
          style={{
            color: c.muted,
            fontSize: tokens.textXs,
            textAlign: textStart,
            writingDirection,
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
      <Row style={{ alignItems: "flex-start", gap: 10 }}>
        <Pressable
          unstable_pressDelay={0}
          disabled={busy}
          onPress={() => {
            hapticImpact();
            onToggleDone(task);
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled: !!busy }}
          accessibilityLabel={done ? t("common.done") : t("common.open")}
          hitSlop={8}
          style={({ pressed }) => [{ paddingTop: 1, opacity: busy ? 0.5 : pressed ? 0.6 : 1 }]}
        >
          <Ionicons
            name={done ? "checkbox" : "checkbox-outline"}
            size={22}
            color={done ? c.good : c.muted}
          />
        </Pressable>
        {onPress ? (
          <Pressable
            unstable_pressDelay={0}
            style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.7 : 1 }]}
            onPress={() => {
              hapticSelection();
              onPress(task);
            }}
          >
            {titleBlock}
          </Pressable>
        ) : (
          titleBlock
        )}
      </Row>
      <Row style={{ marginTop: 8, justifyContent: "flex-start" }} wrap>
        {task.project_name ? <Badge label={task.project_name} /> : null}
        {isExternalTask(task) ? (
          <Badge label={taskSourceLabel(t, task.source)} tone="accent" />
        ) : null}
        <Badge label={taskPriorityLabel(t, task.priority)} tone={priorityTone(task.priority)} />
        {task.due_date ? <Badge label={`${t("common.due")}: ${task.due_date}`} /> : null}
        <Pressable
          unstable_pressDelay={0}
          onPress={() => {
            hapticImpact();
            onAdvanceStatus?.(task);
          }}
          disabled={busy || !onAdvanceStatus}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <Badge label={taskStatusLabel(t, task.status)} tone={statusTone(task.status)} />
        </Pressable>
      </Row>
    </Card>
  );
});

export { NEXT_STATUS };
