import type { Task } from "@/lib/types";
import { parseGithubExternalId } from "./github/ids";
import { WritebackError } from "./writeback-errors";

/** Provider list/board id needed for write-back. GitHub can derive it from `external_id`. */
export function resolveExternalListId(task: Task): string {
  if (task.external_list_id) return task.external_list_id;

  if (task.source === "github" && task.external_id) {
    const { owner, repo } = parseGithubExternalId(task.external_id);
    return `${owner}/${repo}`;
  }

  const metaListId = task.external_meta?.listId;
  if (typeof metaListId === "string" && metaListId.length > 0) return metaListId;

  throw new WritebackError("external_missing_ids", "external_missing_ids", true);
}
