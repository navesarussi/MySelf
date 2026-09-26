import { reportIntegrationError } from "@/lib/error-reporting";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { resolveExternalListId } from "./resolve-list-id";
import { applyExternalStatusChange } from "./writeback";
import {
  classifyWritebackError,
  pickPreferredWritebackError,
  shouldSkipMondayArchiveFallback,
  WritebackError,
} from "./writeback-errors";
import {
  getValidGoogleTasksAccessToken,
  patchGoogleTask,
  moveGoogleTask,
  deleteGoogleTask,
} from "./google-tasks/client";
import { getGithubAccessToken, patchGithubIssue } from "./github/client";
import { parseGithubExternalId } from "./github/ids";
import {
  completeByExternalId,
  reopenByExternalId,
  archiveByExternalId,
} from "./monday/status";
import { parseMondayExternalId } from "./monday/ids";
import { getMondayAccessToken, mutateMondayStatusColumn } from "./monday/status";
import { fetchMondayItemWritebackContext } from "./monday/fetch";
import { assertMondayWriteScope } from "./monday/scopes";

export type ExternalTaskFieldPatch = {
  title?: string;
  notes?: string | null;
  due_date?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  /** Monday-specific: label index from board settings. */
  monday_status_index?: number;
  external_list_id?: string;
};

function mondayCache(task: Task) {
  return {
    statusLabels: task.external_meta?.statusLabels,
    statusColumnId: task.external_meta?.statusColumnId,
    statusLabel: task.external_meta?.statusLabel,
    statusLabelIndex: task.external_meta?.statusLabelIndex,
  };
}

async function writeMondayStatusIndex(
  task: Task,
  labelIndex: number
): Promise<void> {
  if (!task.external_id) throw new WritebackError("external_missing_ids", "external_missing_ids", true);
  const { accountKey, itemId } = parseMondayExternalId(task.external_id);
  await assertMondayWriteScope(accountKey);
  const token = await getMondayAccessToken(accountKey);
  const listId = resolveExternalListId(task);
  const ctx = await fetchMondayItemWritebackContext(token, itemId, listId);
  if (!ctx?.statusColumnId) throw new WritebackError("monday_no_status_column", "monday_no_status_column", true);

  const labelText =
    task.external_meta?.statusLabels?.find((l) => l.index === labelIndex)?.label ?? null;

  try {
    await mutateMondayStatusColumn(
      token,
      ctx.boardId,
      itemId,
      ctx.statusColumnId,
      labelIndex,
      labelText
    );
  } catch (err) {
    if (!classifyWritebackError(err).localOnlyAllowed) {
      reportIntegrationError("monday", err, {
        route: "task-patch",
        userAction: "monday_status_index",
      });
    }
    throw err;
  }
}

export async function applyExternalTaskPatch(
  task: Task,
  patch: ExternalTaskFieldPatch
): Promise<void> {
  if (task.source === "manual" || task.source === "gmail") return;
  if (!task.external_id) {
    throw new WritebackError("external_missing_ids", "external_missing_ids", true);
  }

  const listId = resolveExternalListId(task);

  if (task.source === "monday") {
    if (patch.monday_status_index != null) {
      await writeMondayStatusIndex(task, patch.monday_status_index);
      return;
    }
    if (patch.status !== undefined) {
      await applyExternalStatusChange(task, patch.status);
    }
    return;
  }

  if (task.source === "google_tasks") {
    const accessToken = await getValidGoogleTasksAccessToken();
    const googlePatch: Parameters<typeof patchGoogleTask>[3] = {};
    if (patch.title !== undefined) googlePatch.title = patch.title;
    if (patch.notes !== undefined) googlePatch.notes = patch.notes;
    if (patch.due_date !== undefined) {
      googlePatch.due = patch.due_date
        ? `${patch.due_date}T00:00:00.000Z`
        : null;
    }
    if (patch.status !== undefined) {
      googlePatch.status = patch.status === "done" ? "completed" : "needsAction";
    }
    if (Object.keys(googlePatch).length === 0) return;

    try {
      await patchGoogleTask(accessToken, listId, task.external_id, googlePatch);
    } catch (err) {
      reportIntegrationError("google_tasks", err, { route: "task-patch", userAction: "patch" });
      throw err;
    }
    return;
  }

  if (task.source === "github") {
    const accessToken = await getGithubAccessToken();
    const { owner, repo, number } = parseGithubExternalId(task.external_id);
    const ghPatch: Parameters<typeof patchGithubIssue>[4] = {};
    if (patch.title !== undefined) ghPatch.title = patch.title;
    if (patch.notes !== undefined) ghPatch.body = patch.notes;
    if (patch.status !== undefined) {
      ghPatch.state = patch.status === "done" ? "closed" : "open";
    }
    if (Object.keys(ghPatch).length === 0) return;

    try {
      await patchGithubIssue(accessToken, owner, repo, number, ghPatch);
    } catch (err) {
      reportIntegrationError("github", err, { route: "task-patch", userAction: "patch" });
      throw err;
    }
  }
}

export async function applyExternalTaskDelete(task: Task): Promise<void> {
  if (task.source === "manual" || task.source === "gmail") return;
  if (!task.external_id) {
    throw new WritebackError("external_missing_ids", "external_missing_ids", true);
  }

  const listId = resolveExternalListId(task);

  if (task.source === "monday") {
    try {
      await completeByExternalId(task.external_id, listId, mondayCache(task));
    } catch (completeErr) {
      if (shouldSkipMondayArchiveFallback(completeErr)) {
        throw completeErr;
      }
      try {
        await archiveByExternalId(task.external_id, listId);
      } catch (archiveErr) {
        throw pickPreferredWritebackError(completeErr, archiveErr);
      }
    }
    return;
  }

  if (task.source === "google_tasks") {
    const accessToken = await getValidGoogleTasksAccessToken();
    try {
      await deleteGoogleTask(accessToken, listId, task.external_id);
    } catch (err) {
      try {
        await patchGoogleTask(accessToken, listId, task.external_id, { status: "completed" });
      } catch {
        reportIntegrationError("google_tasks", err, { route: "task-delete", userAction: "delete" });
        throw err;
      }
    }
    return;
  }

  if (task.source === "github") {
    await applyExternalStatusChange(task, "done");
  }
}

export async function applyExternalTaskMove(
  task: Task,
  targetListId: string
): Promise<void> {
  if (task.source !== "google_tasks" || !task.external_id) {
    throw new WritebackError("provider_not_found", "move_not_supported", false);
  }
  const fromListId = resolveExternalListId(task);
  const accessToken = await getValidGoogleTasksAccessToken();
  try {
    await moveGoogleTask(accessToken, fromListId, targetListId, task.external_id);
  } catch (err) {
    reportIntegrationError("google_tasks", err, { route: "task-move", userAction: "move" });
    throw err;
  }
}
