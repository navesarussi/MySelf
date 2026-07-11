import { createClient } from "@supabase/supabase-js";
import { cache } from "react";

export const getSupabase = cache(() => {
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
