import { isPersonalTable, type PersonalTable } from "@/lib/db/tenancy";

type Row = Record<string, unknown>;
type Base = { from(table: string): any };

function stamp(values: unknown, userId: string): unknown {
  if (Array.isArray(values)) return values.map((row: Row) => ({ ...row, user_id: userId }));
  return { ...(values as Row), user_id: userId };
}

/**
 * Query builders for per-account tables that cannot leave the account: reads,
 * updates and deletes are filtered to `user_id`, and every written row has
 * `user_id` set — overriding whatever the caller put there, so a row can't be
 * created for, or moved to, another account.
 *
 * Upserts get no filter (PostgREST can't filter one), so their conflict target
 * must include `user_id` for the conflict to be limited to this account's rows.
 */
export function scopedClient<B extends Base>(base: B, userId: string) {
  return {
    userId,
    from(table: PersonalTable): ReturnType<B["from"]> {
      if (!isPersonalTable(table)) throw new Error(`not_a_personal_table:${table}`);
      const qb = base.from(table);
      return {
        select: (...args: unknown[]) => qb.select(...args).eq("user_id", userId),
        insert: (values: unknown, ...args: unknown[]) => qb.insert(stamp(values, userId), ...args),
        upsert: (values: unknown, ...args: unknown[]) => qb.upsert(stamp(values, userId), ...args),
        update: (values: unknown, ...args: unknown[]) =>
          qb.update(stamp(values, userId), ...args).eq("user_id", userId),
        delete: (...args: unknown[]) => qb.delete(...args).eq("user_id", userId),
      } as ReturnType<B["from"]>;
    },
  };
}

export type ScopedDb<B extends Base = Base> = ReturnType<typeof scopedClient<B>>;
