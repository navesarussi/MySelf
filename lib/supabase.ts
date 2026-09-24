import { createClient } from "@supabase/supabase-js";
import { cache } from "react";

const serviceClient = cache(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key, {
    db: { schema: "myself" },
    auth: { persistSession: false },
  });
});

export const getSupabase = serviceClient;

/**
 * The service client with no account scoping. Per-account tables go through
 * `userDb()`; this exists for the few reads that must look across accounts
 * (finding which account a WhatsApp number belongs to) and for `userDb` itself.
 */
export function getUnscopedSupabase() {
  return serviceClient();
}
