const DEV_PREFIX = "/dev";

/** Detect `קוד:` or case-insensitive `/dev` prefix; return trimmed task or null. */
export function parseCodingTaskPrefix(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  if (text.startsWith("קוד:")) {
    const task = text.slice("קוד:".length).trim();
    return task.length > 0 ? task : "";
  }

  const lower = text.toLowerCase();
  if (lower.startsWith(DEV_PREFIX)) {
    const rest = text.slice(DEV_PREFIX.length);
    const task = rest.replace(/^[\s:]+/, "").trim();
    return task.length > 0 ? task : "";
  }

  return null;
}

export function isCodingTaskMessage(raw: string): boolean {
  return parseCodingTaskPrefix(raw) !== null;
}
