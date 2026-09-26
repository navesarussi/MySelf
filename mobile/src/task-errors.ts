import type { Task, TaskSource } from "@/lib/types";
import { ApiError } from "./api/client";

type TaskMutationPayload = {
  local_only?: boolean;
  warning?: string;
  source?: TaskSource;
  error?: string;
  user_message_he?: string;
};

function isReconnectError(code?: string): boolean {
  if (!code) return false;
  return (
    code === "not_connected" ||
    code === "integration_not_connected" ||
    code === "integration_auth_failed" ||
    code === "missing_refresh_token" ||
    code.startsWith("token_refresh_failed")
  );
}

export function readApiError(err: unknown): string | undefined {
  if (err instanceof ApiError) {
    if (err.userMessageHe) return err.userMessageHe;
    return err.message || undefined;
  }
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message: unknown }).message);
    return message || undefined;
  }
  return undefined;
}

export function isLocalOnlyAllowed(err: unknown): boolean {
  return err instanceof ApiError && err.localOnlyAllowed === true;
}

export function taskUpdateErrorFlash(task: Task, apiError?: string): string {
  if (!apiError) return "flash.taskUpdateError";
  if (isReconnectError(apiError)) {
    return taskReconnectFlash(task.source);
  }
  if (apiError === "external_missing_ids") return "flash.taskResyncRequired";
  if (apiError === "monday_permission_denied") return "flash.taskMondayPermissionDenied";
  if (task.source === "google_tasks") return "flash.taskUpdateGoogleFailed";
  if (task.source === "monday") return "flash.taskUpdateMondayFailed";
  if (task.source === "github") return "flash.taskUpdateGithubFailed";
  if (task.source === "gmail") return "flash.taskUpdateError";
  return "flash.taskUpdateError";
}

export function taskDeleteErrorFlash(task: Task, apiError?: string): string {
  if (!apiError) return "flash.taskDeleteError";
  if (isReconnectError(apiError)) {
    return taskReconnectFlash(task.source);
  }
  if (apiError === "external_missing_ids") return "flash.taskResyncRequired";
  if (task.source === "google_tasks") return "flash.taskDeleteGoogleFailed";
  if (task.source === "monday") return "flash.taskDeleteMondayFailed";
  if (task.source === "github") return "flash.taskDeleteGithubFailed";
  return "flash.taskDeleteError";
}

export function taskLocalOnlyWarningFlash(payload: TaskMutationPayload): string {
  if (payload.user_message_he) return payload.user_message_he;
  const source = payload.source ?? "manual";
  if (payload.warning === "external_missing_ids") return "flash.taskLocalOnlyResync";
  if (payload.warning === "monday_permission_denied") {
    return "flash.taskMondayPermissionDenied";
  }
  return taskReconnectFlash(source);
}

/** Delete succeeded locally after upstream refused — prefer a calm hide message over generic failure. */
export function taskDeleteLocalOnlyFlash(payload: TaskMutationPayload): string {
  if (payload.user_message_he) return payload.user_message_he;
  if (
    payload.warning === "monday_permission_denied" ||
    payload.warning === "external_permission_denied"
  ) {
    return "flash.taskDeleteHiddenMonday";
  }
  return taskLocalOnlyWarningFlash(payload);
}

/** Resolve a local-only warning to display text (Hebrew body or i18n flash key). */
export function formatLocalOnlyWarning(
  payload: TaskMutationPayload,
  t: (key: string) => string
): string {
  const warn = taskLocalOnlyWarningFlash(payload);
  return warn.startsWith("flash.") ? t(warn) : warn;
}

function taskReconnectFlash(source: TaskSource): string {
  if (source === "google_tasks") return "flash.taskReconnectGoogle";
  if (source === "monday") return "flash.taskReconnectMonday";
  if (source === "github") return "flash.taskReconnectGithub";
  return "flash.taskReconnectGeneric";
}

export function isLocalOnlyPayload(value: unknown): value is TaskMutationPayload & { local_only: true } {
  return Boolean(value && typeof value === "object" && (value as TaskMutationPayload).local_only);
}
