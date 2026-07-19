export type GithubRepoListItem = {
  id: string;
  title: string;
  owner: string;
  name: string;
};

export function groupGithubReposByOwner(
  repos: GithubRepoListItem[]
): Array<{ owner: string; repos: GithubRepoListItem[] }> {
  const byOwner = new Map<string, GithubRepoListItem[]>();
  for (const repo of repos) {
    const list = byOwner.get(repo.owner) ?? [];
    list.push(repo);
    byOwner.set(repo.owner, list);
  }
  return [...byOwner.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([owner, items]) => ({
      owner,
      repos: [...items].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    }));
}

export function toGithubRepoListItem(fullName: string): GithubRepoListItem | null {
  const slash = fullName.indexOf("/");
  if (slash <= 0 || slash === fullName.length - 1) return null;
  const owner = fullName.slice(0, slash);
  const name = fullName.slice(slash + 1);
  return { id: fullName, title: fullName, owner, name };
}
