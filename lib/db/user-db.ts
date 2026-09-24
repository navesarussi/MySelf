import { getUnscopedSupabase } from "@/lib/supabase";
import { currentUserId } from "@/lib/db/current-user";
import { scopedClient } from "@/lib/db/scoped";

/** The only way to reach a per-account table: queries limited to the current account. */
export async function userDb() {
  return scopedClient(getUnscopedSupabase(), await currentUserId());
}

export type UserDb = Awaited<ReturnType<typeof userDb>>;
