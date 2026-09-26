import { after } from "next/server";

/** Keep report work alive after the response on Vercel; fall back outside route context. */
export function scheduleErrorReport(task: () => Promise<void>): void {
  try {
    after(() => task().catch(() => {}));
  } catch {
    void task().catch(() => {});
  }
}
