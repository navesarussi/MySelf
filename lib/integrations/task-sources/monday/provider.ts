import type { TaskSourceProvider, ExternalTaskDraft } from "../types";
import {
  fetchAssignedOpenItems,
  fetchMondayAccount,
  fetchMondayBoards,
  getMondayAccessToken,
  completeByExternalId,
  reopenByExternalId,
} from "./client";
import { getTokenSettings } from "../../tokens";
import { MONDAY_PROVIDER } from "../../monday-config";

export function createMondayProvider(accountKey?: string): TaskSourceProvider {
  return {
    id: "monday",
    capabilities: {
      pullOpen: true,
      writeStatus: true,
      listPicker: true,
    },

    async listSources() {
      if (!accountKey) throw new Error("account_required");
      const accessToken = await getMondayAccessToken(accountKey);
      return fetchMondayBoards(accessToken);
    },

    async pullOpenTasks(selectedListIds: string[]): Promise<ExternalTaskDraft[]> {
      if (!accountKey) throw new Error("account_required");
      const accessToken = await getMondayAccessToken(accountKey);
      const settings = await getTokenSettings<{
        account_name?: string;
        account_slug?: string;
      }>(MONDAY_PROVIDER, accountKey);
      const account = {
        id: accountKey,
        name: settings.account_name ?? accountKey,
        slug: settings.account_slug ?? "",
      };
      // Prefer live account slug/name when possible
      try {
        const live = await fetchMondayAccount(accessToken);
        account.name = live.name;
        account.slug = live.slug;
      } catch {
        /* use settings */
      }
      return fetchAssignedOpenItems(accessToken, selectedListIds, account);
    },

    async complete(externalId: string, listId: string) {
      await completeByExternalId(externalId, listId);
    },

    async reopen(externalId: string, listId: string, meta?: { statusLabel?: string }) {
      await reopenByExternalId(externalId, listId, meta?.statusLabel);
    },
  };
}
