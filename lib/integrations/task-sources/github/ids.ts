export function makeGithubExternalId(fullName: string, number: number): string {
  return `${fullName}#${number}`;
}

export function parseGithubExternalId(externalId: string): {
  owner: string;
  repo: string;
  number: number;
} {
  const hash = externalId.lastIndexOf("#");
  if (hash <= 0) throw new Error("invalid_github_external_id");
  const fullName = externalId.slice(0, hash);
  const number = Number(externalId.slice(hash + 1));
  const slash = fullName.indexOf("/");
  if (slash <= 0 || !Number.isFinite(number) || number <= 0) {
    throw new Error("invalid_github_external_id");
  }
  return {
    owner: fullName.slice(0, slash),
    repo: fullName.slice(slash + 1),
    number,
  };
}
