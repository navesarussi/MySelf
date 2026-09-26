/**
 * Re-normalize finance_merchant_rules display names and soft-archive dormant fixed rules.
 *
 * Usage: tsx scripts/finance/normalize-merchant-display.ts [--dry-run]
 */
import { getSupabase } from "@/lib/supabase";
import { normalizeStoredMerchantFields } from "@/lib/finance/merchant-display";
import { normalizeMerchantKey } from "@/lib/finance/merchant-rules-client";
import { round2 } from "@/lib/finance/money";

const dryRun = process.argv.includes("--dry-run");

type RuleRow = {
  id: string;
  merchant_key: string;
  display_name: string | null;
  expense_type: string | null;
  is_active: boolean;
};

async function main() {
  const { data: rules, error } = await getSupabase()
    .from("finance_merchant_rules")
    .select("id, merchant_key, display_name, expense_type, is_active");
  if (error) throw new Error(error.message);

  let renamed = 0;
  let archived = 0;

  for (const rule of (rules ?? []) as RuleRow[]) {
    const normalized = normalizeStoredMerchantFields({
      merchant_key: rule.merchant_key,
      display_name: rule.display_name,
    });
    const keyChanged = normalized.merchant_key !== normalizeMerchantKey(rule.merchant_key);
    const displayChanged = (normalized.display_name ?? "") !== (rule.display_name ?? "").trim();

    if (keyChanged || displayChanged) {
      renamed++;
      if (!dryRun) {
        const { error: upErr } = await getSupabase()
          .from("finance_merchant_rules")
          .update({
            merchant_key: normalized.merchant_key,
            display_name: normalized.display_name,
            updated_at: new Date().toISOString(),
          })
          .eq("id", rule.id);
        if (upErr) throw new Error(upErr.message);
      }
    }

    if (rule.expense_type !== "fixed" || !rule.is_active) continue;

    const keys = [normalized.merchant_key, rule.merchant_key].filter(Boolean);
    const { data: txns } = await getSupabase()
      .from("finance_transactions")
      .select("amount, merchant, description")
      .eq("kind", "expense")
      .is("deleted_at", null)
      .gt("amount", 0)
      .order("txn_date", { ascending: false })
      .limit(200);

    const hasCharge = (txns ?? []).some((t) => {
      const m = (t.merchant ?? t.description ?? "").toLowerCase();
      return keys.some((k) => k && m.includes(k.split(" ")[0]?.slice(0, 4) ?? ""));
    });

    if (!hasCharge && rule.is_active) {
      archived++;
      if (!dryRun) {
        await getSupabase()
          .from("finance_merchant_rules")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", rule.id);
      }
    }
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Normalized ${renamed} merchant rule(s); archived ${archived} dormant fixed rule(s).`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
