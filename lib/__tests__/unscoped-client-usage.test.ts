import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * getUnscopedSupabase() reads per-account tables across every account. Each use
 * is a deliberate exception; a new one should be a conscious change to this list.
 */
const ALLOWED = new Set([
  "lib/supabase.ts",
  "lib/db/user-db.ts",
  "lib/agent/account-by-phone.ts",
]);

const ROOT = join(__dirname, "..", "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "__tests__") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

describe("getUnscopedSupabase", () => {
  it("is only used where reading across accounts is the point", () => {
    const users = ["app", "lib", "scripts"]
      .flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .filter((file) => readFileSync(file, "utf8").includes("getUnscopedSupabase"))
      .map((file) => relative(ROOT, file));
    assert.deepEqual(users.filter((file) => !ALLOWED.has(file)), []);
  });
});
