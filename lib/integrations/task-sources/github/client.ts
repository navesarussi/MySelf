import {
  GITHUB_OAUTH_SCOPES,
  GITHUB_PROVIDER,
  githubRedirectUri,
} from "../../github-config";
import { getIntegrationToken } from "../../tokens";
import type { GithubIssue } from "./map";

export function githubAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: githubRedirectUri(),
    scope: GITHUB_OAUTH_SCOPES,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeGithubCode(code: string) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID!,
      client_secret: process.env.GITHUB_CLIENT_SECRET!,
      code,
      redirect_uri: githubRedirectUri(),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`token_exchange_failed:${res.status}:${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    throw new Error(`token_exchange_failed:${data.error ?? "no_token"}:${data.error_description ?? ""}`);
  }
  return { access_token: data.access_token };
}

async function githubFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "MySelf-App",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`github_api_failed:${res.status}:${path}:${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function getGithubAccessToken(): Promise<string> {
  const token = await getIntegrationToken(GITHUB_PROVIDER);
  if (!token?.access_token) throw new Error("not_connected");
  return token.access_token;
}

export async function fetchGithubUser(accessToken: string) {
  return githubFetch<{ login: string; id: number; name: string | null }>(accessToken, "/user");
}

export async function fetchGithubRepos(accessToken: string) {
  type RepoRow = { full_name: string; name: string; owner?: { login: string } };
  const byFullName = new Map<string, RepoRow>();

  for (let page = 1; page <= 15; page++) {
    const batch = await githubFetch<RepoRow[]>(
      accessToken,
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`
    );
    for (const repo of batch) byFullName.set(repo.full_name, repo);
    if (batch.length < 100) break;
  }

  // Explicit org pass — some org repos are missing from /user/repos without org grant,
  // and this surfaces orgs the token can see after read:org + org approval.
  let orgs: Array<{ login: string }> = [];
  try {
    orgs = await githubFetch<Array<{ login: string }>>(accessToken, "/user/orgs?per_page=100");
  } catch {
    orgs = [];
  }

  for (const org of orgs) {
    for (let page = 1; page <= 10; page++) {
      try {
        const batch = await githubFetch<RepoRow[]>(
          accessToken,
          `/orgs/${encodeURIComponent(org.login)}/repos?per_page=100&page=${page}&type=all&sort=updated`
        );
        for (const repo of batch) byFullName.set(repo.full_name, repo);
        if (batch.length < 100) break;
      } catch {
        break;
      }
    }
  }

  return [...byFullName.values()]
    .map((r) => {
      const owner = r.owner?.login ?? r.full_name.split("/")[0] ?? "";
      return {
        id: r.full_name,
        title: r.full_name,
        owner,
        name: r.name,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { sensitivity: "base" }));
}

export async function fetchAssignedOpenIssues(accessToken: string): Promise<GithubIssue[]> {
  const issues: GithubIssue[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await githubFetch<GithubIssue[]>(
      accessToken,
      `/issues?filter=assigned&state=open&per_page=100&page=${page}`
    );
    issues.push(...batch);
    if (batch.length < 100) break;
  }
  return issues;
}

export async function setGithubIssueState(
  accessToken: string,
  owner: string,
  repo: string,
  number: number,
  state: "open" | "closed"
) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`, {
    method: "PATCH",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "MySelf-App",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`github_issue_update_failed:${res.status}:${body.slice(0, 300)}`);
  }
}
