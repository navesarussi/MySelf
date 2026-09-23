import { getSupabase } from "@/lib/supabase";

/** True when finance import tables are not migrated yet. */
export async function isFinanceImportLayerMissing(): Promise<boolean> {
  const sb = getSupabase();
  const { error } = await sb.from("finance_import_batches").select("id").limit(1);
  if (!error) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || error.code === "42P01";
}
