/**
 * Apply Supabase migrations that have not been applied yet.
 *
 * db-apply used to re-run every file in supabase/migrations on each invocation,
 * which only works while every migration stays idempotent against *every future
 * shape of the schema*. It does not: 0003 creates an index on `tasks.project`,
 * and 0007 drops that column, so replaying 0003 against the current database
 * fails with `column "project" does not exist`. The migration is not wrong — it
 * is a correct forward step that simply cannot be replayed.
 *
 * So this keeps a ledger instead, the way migration tooling normally does, and
 * applies each file exactly once in filename order.
 *
 * Usage:  tsx scripts/db-migrate.ts [--dry-run]
 * Needs:  SUPABASE_ACCESS_TOKEN  (SUPABASE_PROJECT_REF optional)
 */
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const REF = process.env.SUPABASE_PROJECT_REF?.trim() || "roeefqpdbftlndzsvhfj";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const DIR = join(process.cwd(), "supabase", "migrations");
const DRY = process.argv.includes("--dry-run");

const LEDGER_DDL = `
create table if not exists myself.schema_migrations (
  filename text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);`;

async function runSql(query: string): Promise<unknown> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  if (!TOKEN) {
    console.error("ERROR: SUPABASE_ACCESS_TOKEN is not set.");
    console.error("Create one at https://supabase.com/dashboard/account/tokens");
    process.exit(1);
  }

  await runSql(LEDGER_DDL);

  const applied = new Map<string, string>();
  const rows = (await runSql("select filename, checksum from myself.schema_migrations;")) as
    | { filename: string; checksum: string }[]
    | null;
  for (const r of rows ?? []) applied.set(r.filename, r.checksum);

  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !applied.has(f));

  // A file that changed after being applied is reported, never silently re-run:
  // re-running is exactly what this script exists to stop.
  const drifted = files.filter(
    (f) => applied.has(f) && applied.get(f) !== sha(readFileSync(join(DIR, f), "utf8"))
  );
  for (const f of drifted) console.warn(`! ${f} changed since it was applied (not re-applied)`);

  console.log(`${files.length} migration file(s), ${applied.size} already applied, ${pending.length} pending`);
  if (pending.length === 0) {
    console.log("Nothing to apply.");
    return;
  }
  if (DRY) {
    for (const f of pending) console.log(`  would apply ${f}`);
    return;
  }

  for (const f of pending) {
    const sql = readFileSync(join(DIR, f), "utf8");
    process.stdout.write(`→ ${f} ... `);
    try {
      await runSql(sql);
    } catch (err) {
      console.log("FAILED");
      console.error(err instanceof Error ? err.message : err);
      console.error(`\nStopped at ${f}. Earlier migrations stay recorded as applied.`);
      process.exit(1);
    }
    await runSql(
      `insert into myself.schema_migrations (filename, checksum) values (${quote(f)}, ${quote(sha(sql))})
       on conflict (filename) do update set checksum = excluded.checksum, applied_at = now();`
    );
    console.log("ok");
  }

  await runSql("notify pgrst, 'reload schema';");
  console.log(`Applied ${pending.length} migration(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
