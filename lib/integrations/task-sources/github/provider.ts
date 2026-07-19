import type { TaskSourceProvider, ExternalTaskDraft } from "../types";
import {
  fetchAssignedOpenIssues,
  fetchGithubRepos,
  getGithubAccessToken,
  setGithubIssueState,
} from "./client";
import { mapGithubIssue } from "./map";
import { parseGithubExternalId } from "./ids";

export function createGithubProvider(): TaskSourceProvider {
  return {
    id: "github",
    capabilities: {
      pullOpen: true,
      writeStatus: true,
      listPicker: true,
    },

    async listSources() {
      const accessToken = await getGithubAccessToken();
      return fetchGithubRepos(accessToken);
    },

    async pullOpenTasks(selectedListIds: string[]): Promise<ExternalTaskDraft[]> {
      const accessToken = await getGithubAccessToken();
      const selected = new Set(selectedListIds);
      const issues = await fetchAssignedOpenIssues(accessToken);
      const drafts: ExternalTaskDraft[] = [];
      for (const issue of issues) {
        const draft = mapGithubIssue(issue);
        if (!draft) continue;
        if (!selected.has(draft.externalListId)) continue;
        drafts.push(draft);
      }
      return drafts;
    },

    async complete(externalId: string, _listId: string) {
      const accessToken = await getGithubAccessToken();
      const { owner, repo, number } = parseGithubExternalId(externalId);
      await setGithubIssueState(accessToken, owner, repo, number, "closed");
    },

    async reopen(externalId: string, _listId: string) {
      const accessToken = await getGithubAccessToken();
      const { owner, repo, number } = parseGithubExternalId(externalId);
      await setGithubIssueState(accessToken, owner, repo, number, "open");
    },
  };
}
