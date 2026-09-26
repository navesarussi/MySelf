/**
 * Re-normalize finance_merchant_rules display_name only (never merchant_key).
 *
 * Usage:
 *   tsx scripts/finance/normalize-merchant-display.ts            # dry-run (default)
 *   tsx scripts/finance/normalize-merchant-display.ts --apply    # write to DB
 */
import { normalizeStoredDisplayName } from "@/lib/finance/merchant-display";
import { getSupabase } from "@/lib/supabase";

const apply = process.argv.includes("--apply");

type RuleRow = {
  id: string;
  merchant_key: string;
  display_name: string | null;
};

type PlannedUpdate = {
  id: string;
  merchant_key: string;
  display_before: string;
  display_after: string;
};

function pad(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width - 1) + "…";
  return s + " ".repeat(width - s.length);
}

async function main() {
  const { data: rules, error } = await getSupabase()
    .from("finance_merchant_rules")
    .select("id, merchant_key, display_name");
  if (error) throw new Error(error.message);

  const updates: PlannedUpdate[] = [];

  for (const rule of (rules ?? []) as RuleRow[]) {
    const { display_name } = normalizeStoredDisplayName({
      merchant_key: rule.merchant_key,
      display_name: rule.display_name,
    });
    const before = (rule.display_name ?? "").trim();
    const after = (display_name ?? "").trim();
    if (before === after) continue;

    updates.push({
      id: rule.id,
      merchant_key: rule.merchant_key,
      display_before: before || "(null)",
      display_after: after || "(null)",
    });
  }

  console.log(
    `${apply ? "[apply] " : "[dry-run] "}${updates.length} of ${(rules ?? []).length} rule(s) would update display_name.\n`
  );

  if (updates.length > 0) {
    console.log(`${pad("merchant_key", 36)} ${pad("display_before", 40)} display_after`);
    console.log("-".repeat(120));
    for (const u of updates) {
      console.log(`${pad(u.merchant_key, 36)} ${pad(u.display_before, 40)} ${u.display_after}`);
    }
    console.log("");
  }

  if (!apply) {
    console.log("No changes written. Re-run with --apply to persist.");
    return;
  }

  if (updates.length === 0) {
    console.log("Nothing to apply.");
    return;
  }

  const now = new Date().toISOString();
  const payload = updates.map((u) => ({
    id: u.id,
    merchant_key: u.merchant_key,
    display_name: u.display_after === "(null)" ? null : u.display_after,
    updated_at: now,
  }));

  const { error: upErr } = await getSupabase()
    .from("finance_merchant_rules")
    .upsert(payload, { onConflict: "id" });
  if (upErr) throw new Error(upErr.message);

  console.log(`Applied ${updates.length} display_name update(s) atomically.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
