import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { isPersonalTable, type PersonalTable } from "@/lib/db/tenancy";

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

type ServiceClient = ReturnType<typeof serviceClient>;

/** A table name that is not per-account; a per-account literal becomes `never`. */
type SharedTable<T extends string> = T & (T extends PersonalTable ? never : unknown);

export type SharedClient = Omit<ServiceClient, "from"> & {
  from<T extends string>(table: SharedTable<T>): ReturnType<ServiceClient["from"]>;
};

/** Refuse per-account tables at runtime too — a table name held in a variable gets past the type. */
export function guardSharedTables<C extends { from(table: string): unknown }>(client: C): C {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => {
          if (isPersonalTable(table)) throw new Error(`per_account_table_needs_userDb:${table}`);
          return target.from(table);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * The service client for shared and system tables — finance, trading, the
 * allowlist. Per-account tables are refused (type and runtime): use `userDb()`.
 */
export const getSupabase = cache((): SharedClient => guardSharedTables(serviceClient()) as SharedClient);

/**
 * The service client with no account scoping. Per-account tables go through
 * `userDb()`; this exists for the few reads that must look across accounts
 * (finding which account a WhatsApp number belongs to) and for `userDb` itself.
 */
export function getUnscopedSupabase(): ServiceClient {
  return serviceClient();
}
