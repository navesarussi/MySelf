import type { TaskSourceProvider, ExternalTaskDraft } from "../types";
import {
  getValidGoogleTasksAccessToken,
  fetchTaskLists,
  fetchOpenTasks,
  completeGoogleTask,
  reopenGoogleTask,
} from "./client";
import { mapGoogleTask } from "./map";

export function createGoogleTasksProvider(): TaskSourceProvider {
  return {
    id: "google_tasks",
    capabilities: {
      pullOpen: true,
      writeStatus: true,
      listPicker: true,
    },

    async listSources() {
      const accessToken = await getValidGoogleTasksAccessToken();
      const lists = await fetchTaskLists(accessToken);
      return lists.map((list) => ({ id: list.id, title: list.title }));
    },

    async pullOpenTasks(selectedListIds: string[]): Promise<ExternalTaskDraft[]> {
      const accessToken = await getValidGoogleTasksAccessToken();
      const lists = await fetchTaskLists(accessToken);
      const listsById = new Map(lists.map((list) => [list.id, list]));

      const drafts: ExternalTaskDraft[] = [];

      for (const listId of selectedListIds) {
        const list = listsById.get(listId);
        if (!list) continue;

        const tasks = await fetchOpenTasks(accessToken, listId);
        for (const task of tasks) {
          const draft = mapGoogleTask(task, listId, list.title);
          if (draft) drafts.push(draft);
        }
      }

      return drafts;
    },

    async complete(externalId: string, listId: string) {
      const accessToken = await getValidGoogleTasksAccessToken();
      await completeGoogleTask(accessToken, listId, externalId);
    },

    async reopen(externalId: string, listId: string) {
      const accessToken = await getValidGoogleTasksAccessToken();
      await reopenGoogleTask(accessToken, listId, externalId);
    },
  };
}
