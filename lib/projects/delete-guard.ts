export type DeleteGuardResult = "ok" | "blocked";

export function canDeleteProject(
  taskCount: number,
  relationshipCount: number
): DeleteGuardResult {
  return taskCount + relationshipCount > 0 ? "blocked" : "ok";
}
