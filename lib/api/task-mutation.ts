import type { TaskSource } from "@/lib/types";

export function attachTaskSource(
  body: Record<string, unknown>,
  source: TaskSource
): Record<string, unknown> {
  return { ...body, source };
}
