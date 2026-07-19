import type { TaskSourceId, TaskSourceProvider } from "./types";
import { createGoogleTasksProvider } from "./google-tasks/provider";
import { createMondayProvider } from "./monday/provider";

const providers = new Map<TaskSourceId, () => TaskSourceProvider>([
  ["google_tasks", createGoogleTasksProvider],
  ["monday", () => createMondayProvider()],
]);

export function getTaskSourceProvider(id: TaskSourceId): TaskSourceProvider | null {
  const factory = providers.get(id);
  return factory ? factory() : null;
}

export function listTaskSourceProviders(): TaskSourceId[] {
  return Array.from(providers.keys());
}
