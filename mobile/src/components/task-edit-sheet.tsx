import React from "react";
import { Text, View } from "react-native";
import type { Project, Task, TaskPriority, TaskStatus } from "@/lib/types";
import type { TaskCapabilities, StatusOption } from "@/lib/integrations/task-sources/capabilities";
import { getTaskCapabilities, getTaskStatusOptions } from "@/lib/integrations/task-sources/capabilities";
import { FormModal } from "./form-modal";
import { Chip, Input, Label, Row } from "./ui";
import { ALL_PRIORITIES } from "./tasks-filter-bar";
import { isExternalTask, taskPriorityLabel, taskStatusLabel } from "./task-card";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";

export type TaskEditFormState = {
  id?: string;
  title: string;
  project_id: string;
  priority: TaskPriority;
  status: TaskStatus;
  mondayStatusIndex?: number | null;
  due_date: string;
  notes: string;
  notesLoading?: boolean;
  source?: Task["source"];
  external_meta?: Task["external_meta"];
  external_list_id?: string | null;
};

type Props = {
  form: TaskEditFormState | null;
  projects: Project[];
  listOptions: Array<{ id: string; title: string }>;
  busy?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
  onHideLocally?: () => void;
  onCopyToManual?: () => void;
  onChange: (next: TaskEditFormState) => void;
};

function FieldHint({ text }: { text: string }) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  return (
    <Text
      style={{
        color: c.muted,
        fontSize: tokens.textXs,
        textAlign: textStart,
        writingDirection,
        marginBottom: 8,
      }}
    >
      {text}
    </Text>
  );
}

function StatusChips({
  options,
  activeValue,
  onPick,
}: {
  options: StatusOption[];
  activeValue: string;
  onPick: (opt: StatusOption) => void;
}) {
  return (
    <Row wrap style={{ marginBottom: 8 }}>
      {options.map((opt) => (
        <Chip
          key={opt.value}
          label={opt.label}
          active={activeValue === opt.value}
          onPress={() => onPick(opt)}
        />
      ))}
    </Row>
  );
}

export function TaskEditSheet({
  form,
  projects,
  listOptions,
  busy,
  onClose,
  onSubmit,
  onDelete,
  onHideLocally,
  onCopyToManual,
  onChange,
}: Props) {
  const { t } = useI18n();
  const c = useColors();
  const { textLtr, textStart, writingDirection } = useLayoutDir();

  if (!form) return null;

  const external = form.id ? isExternalTask({ source: form.source ?? "manual" }) : false;
  const caps: TaskCapabilities = getTaskCapabilities({ source: form.source ?? "manual" });
  const statusOptions = form.id
    ? getTaskStatusOptions({
        source: form.source ?? "manual",
        status: form.status,
        external_meta: form.external_meta ?? {},
      } as Task)
    : [];

  const activeStatusValue =
    form.source === "monday" && form.mondayStatusIndex != null
      ? `monday:${form.mondayStatusIndex}`
      : form.status;

  return (
    <FormModal
      visible={form !== null}
      title={form.id ? t("tasks.editTask") : t("tasks.addTask")}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={form.id ? t("tasks.saveChanges") : t("common.add")}
      busy={busy}
      onDelete={form.id && caps.delete.editable ? onDelete : undefined}
    >
      <View>
        {external ? (
          <>
            {!caps.title.editable ? (
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
              </>
            ) : null}
          </>
        ) : null}

        <Label>{t("tasks.titlePlaceholder")}</Label>
        {caps.title.editable ? (
          <Input
            value={form.title}
            onChangeText={(v) => onChange({ ...form, title: v })}
            placeholder={t("tasks.titlePlaceholder")}
          />
        ) : (
          <FieldHint text={caps.title.reasonHe ?? t("tasks.externalReadonlyHint")} />
        )}

        {!external ? (
          <>
            <Label>{t("nav.projects")}</Label>
            <Row wrap style={{ marginBottom: 8 }}>
              {projects.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  active={form.project_id === p.id}
                  onPress={() => onChange({ ...form, project_id: p.id })}
                />
              ))}
            </Row>
          </>
        ) : null}

        <Label>{t("tasks.priorityFilter")}</Label>
        <Row wrap style={{ marginBottom: 8 }}>
          {ALL_PRIORITIES.map((p) => (
            <Chip
              key={p}
              label={taskPriorityLabel(t, p)}
              active={form.priority === p}
              onPress={() => onChange({ ...form, priority: p })}
            />
          ))}
        </Row>

        <Label>{t("common.status")}</Label>
        {caps.status.editable && statusOptions.length ? (
          <StatusChips
            options={statusOptions}
            activeValue={activeStatusValue}
            onPick={(opt) => {
              if (opt.value.startsWith("monday:")) {
                const index = Number(opt.value.slice("monday:".length));
                onChange({
                  ...form,
                  mondayStatusIndex: index,
                  status: opt.isDone ? "done" : "open",
                });
              } else {
                onChange({
                  ...form,
                  status: opt.value as TaskStatus,
                  mondayStatusIndex: null,
                });
              }
            }}
          />
        ) : (
          <Row wrap style={{ marginBottom: 8 }}>
            {(["open", "in_progress", "stuck", "review", "done"] as TaskStatus[]).map((s) => (
              <Chip
                key={s}
                label={taskStatusLabel(t, s)}
                active={form.status === s}
                onPress={() => onChange({ ...form, status: s })}
              />
            ))}
          </Row>
        )}
        {!caps.status.editable && caps.status.reasonHe ? (
          <FieldHint text={caps.status.reasonHe} />
        ) : null}

        <Label>{`${t("common.due")} (YYYY-MM-DD)`}</Label>
        {caps.dueDate.editable ? (
          <>
            <Input
              value={form.due_date}
              onChangeText={(v) => onChange({ ...form, due_date: v })}
              placeholder="2026-12-31"
              autoCapitalize="none"
              style={{ textAlign: textLtr }}
            />
            {form.due_date ? (
              <Row style={{ marginBottom: 8 }}>
                <Chip
                  label={t("tasks.clearDue")}
                  active={false}
                  onPress={() => onChange({ ...form, due_date: "" })}
                />
              </Row>
            ) : null}
          </>
        ) : (
          <FieldHint text={caps.dueDate.reasonHe ?? t("tasks.externalReadonlyHint")} />
        )}

        <Label>{t("tasks.notesPlaceholder")}</Label>
        {caps.notes.editable ? (
          <Input
            value={form.notes}
            onChangeText={(v) => onChange({ ...form, notes: v })}
            placeholder={form.notesLoading ? t("common.loading") : t("tasks.notesPlaceholder")}
            editable={!form.notesLoading}
            multiline
          />
        ) : (
          <FieldHint text={caps.notes.reasonHe ?? t("tasks.externalReadonlyHint")} />
        )}

        {external && caps.moveList.editable && listOptions.length > 1 ? (
          <>
            <Label>{t("tasks.listFilter")}</Label>
            <Row wrap style={{ marginBottom: 8 }}>
              {listOptions.map((list) => (
                <Chip
                  key={list.id}
                  label={list.title}
                  active={form.external_list_id === list.id}
                  onPress={() => onChange({ ...form, external_list_id: list.id })}
                />
              ))}
            </Row>
          </>
        ) : null}

        {external && caps.copyToManual.editable && onCopyToManual ? (
          <Row style={{ marginTop: 8 }}>
            <Chip label={t("tasks.copyToManual")} active={false} onPress={onCopyToManual} />
          </Row>
        ) : null}

        {external && caps.hideLocally.editable && onHideLocally ? (
          <Row style={{ marginTop: 8 }}>
            <Chip label={t("tasks.hideLocally")} active={false} onPress={onHideLocally} />
          </Row>
        ) : null}
      </View>
    </FormModal>
  );
}
