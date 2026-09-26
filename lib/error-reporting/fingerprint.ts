import { createHash } from "node:crypto";

export function normalizeMessage(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "<uuid>")
    .replace(/\b\d{10,}\b/g, "<num>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function topStackFrame(stack: string | null | undefined): string {
  if (!stack) return "";
  const lines = stack.split("\n").map((l) => l.trim());
  for (const line of lines) {
    if (line.startsWith("at ") && !line.includes("node:internal")) {
      return line.slice(0, 240);
    }
  }
  return lines[1]?.slice(0, 240) ?? "";
}

export function computeFingerprint(input: {
  source: string;
  message: string;
  route?: string | null;
  screen?: string | null;
  stack?: string | null;
}): string {
  const anchor = input.route || input.screen || topStackFrame(input.stack);
  const raw = [input.source, normalizeMessage(input.message), anchor].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}
