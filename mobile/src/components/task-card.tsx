import React from "react";
import { Pressable, Text, View } from "react-native";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { Badge, Card, Checkbox, Row } from "./ui";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
};

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
  const { textStart } = useLayoutDir();
  const done = task.status === "done";

  const Body = (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          color: c.ink,
          textAlign: textStart,
          fontWeight: "600",
          textDecorationLine: done ? "line-through" : "none",
        }}
      >
        {task.title}
      </Text>
      <Row style={{ marginTop: 4, justifyContent: "flex-start" }} wrap>
        {task.project_name ? <Badge label={task.project_name} /> : null}
        <Badge
          label={taskPriorityLabel(t, task.priority)}
          tone={task.priority === "high" ? "warn" : task.priority === "medium" ? "accent" : "default"}
        />
        {task.due_date ? <Badge label={`${t("common.due")}: ${task.due_date}`} /> : null}
      </Row>
      {task.notes ? (
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, marginTop: 4 }}>
          {task.notes}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Card style={{ opacity: done ? 0.55 : 1 }}>
      <Row>
        <Checkbox checked={done} disabled={busy} onPress={() => onToggleDone(task)} />
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
