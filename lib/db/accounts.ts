import { runAsUser } from "@/lib/db/user-context";
import { listAccountEmails, primaryGoogleEmail } from "@/lib/integrations/google-auth";

export type AccountRun<T> =
  | { email: string; ok: true; result: T }
  | { email: string; ok: false; error: string };

/**
 * Run background work once per account, each pass inside its own `runAsUser`.
 * Sequential so a cron's load stays what it was with one account, and one
 * account's failure is recorded rather than stopping the others.
 */
export async function forEachAccount<T>(
  fn: (email: string) => Promise<T>,
  opts: { accounts?: string[] } = {}
): Promise<AccountRun<T>[]> {
  const accounts = opts.accounts ?? (await listAccountEmails());
  const runs: AccountRun<T>[] = [];
  for (const email of accounts) {
    try {
      runs.push({ email, ok: true, result: await runAsUser(email, () => fn(email)) });
    } catch (err) {
      runs.push({ email, ok: false, error: err instanceof Error ? err.message : "failed" });
    }
  }
  return runs;
}

/** Work that belongs to the primary account (the trading engine's alerts). Null when there is none. */
export async function runAsPrimary<T>(fn: () => Promise<T>): Promise<T | null> {
  const primary = await primaryGoogleEmail();
  if (!primary) return null;
  return runAsUser(primary, fn);
}
