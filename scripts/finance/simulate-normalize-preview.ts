/**
 * Simulate normalize-merchant-display dry-run against preview JSON inputs.
 * Usage: tsx scripts/finance/simulate-normalize-preview.ts [preview.json] [output.txt]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { normalizeStoredDisplayName } from "@/lib/finance/merchant-display";

const previewPath =
  process.argv[2] ?? "/home/ubuntu/.cursor/projects/workspace/uploads/normalize-preview_a50e.json";
const outPath = process.argv[3] ?? "/opt/cursor/artifacts/normalize-dryrun-v2.txt";

type Preview = { totalRules: number; renames: Array<{ key_from: string; disp_from: string | null }> };

function pad(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width - 1) + "…";
  return s + " ".repeat(width - s.length);
}

function main() {
  const data = JSON.parse(readFileSync(previewPath, "utf8")) as Preview;
  const updates: Array<{ key: string; before: string; after: string }> = [];

  for (const r of data.renames) {
    const { display_name } = normalizeStoredDisplayName({
      merchant_key: r.key_from,
      display_name: r.disp_from,
    });
    const before = (r.disp_from ?? "").trim() || "(null)";
    const after = (display_name ?? "").trim() || "(null)";
    if (before !== after) {
      updates.push({ key: r.key_from, before, after });
    }
  }

  const lines: string[] = [];
  lines.push(`[dry-run] ${updates.length} of ${data.totalRules} rule(s) would update display_name.`);
  lines.push("");
  lines.push(`${pad("merchant_key", 36)} ${pad("display_before", 40)} display_after`);
  lines.push("-".repeat(120));
  for (const u of updates) {
    lines.push(`${pad(u.key, 36)} ${pad(u.before, 40)} ${u.after}`);
  }
  lines.push("");
  lines.push("No changes written. Re-run production script with --apply to persist.");

  const text = lines.join("\n");
  writeFileSync(outPath, text, "utf8");
  console.log(text);
}

main();
