import { runDataIntegrityMaintenance } from "@/lib/db-maintenance";

/** Fire-and-forget DB cleanup when reads detect duplicate rows. */
export function scheduleDataIntegrityCleanup(detectedDuplicates: boolean) {
  if (!detectedDuplicates) return;
  void runDataIntegrityMaintenance().catch((err) => {
    console.error("[data-integrity-cleanup]", err instanceof Error ? err.message : err);
  });
}
