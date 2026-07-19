import type { ExternalTaskDraft } from "../types";
import { makeGithubExternalId } from "./ids";

export type GithubIssue = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  pull_request?: unknown;
  repository?: { full_name: string };
  repository_url?: string;
  milestone?: { due_on: string | null } | null;
};

function repoFullName(issue: GithubIssue): string | null {
  if (issue.repository?.full_name) return issue.repository.full_name;
  if (issue.repository_url) {
    const m = issue.repository_url.match(/repos\/([^/]+\/[^/]+)$/);
    if (m) return m[1];
  }
  return null;
}

export function mapGithubIssue(issue: GithubIssue): ExternalTaskDraft | null {
  if (issue.pull_request) return null;
  const fullName = repoFullName(issue);
  if (!fullName) return null;

  const due = issue.milestone?.due_on?.slice(0, 10) ?? null;
  const notes = issue.body?.trim() ? issue.body.trim().slice(0, 2000) : null;

  return {
    externalId: makeGithubExternalId(fullName, issue.number),
    externalListId: fullName,
    title: issue.title || `#${issue.number}`,
    notes,
    dueDate: due,
    status: "open",
    meta: {
      listTitle: fullName,
      deepLink: issue.html_url,
    },
  };
}
