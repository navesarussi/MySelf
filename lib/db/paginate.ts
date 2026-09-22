/**
 * Read every row of a query, one page at a time.
 *
 * PostgREST caps the rows a single request returns, so a query written without
 * paging silently answers with a prefix of the table — the task sync's
 * mark-done query did exactly that, leaving everything past the cap unclosed.
 *
 * The caller supplies the page fetch and **must order the query**. `range()`
 * over an unordered query is not stable in Postgres: successive pages can
 * repeat rows and skip others, which in the sync meant existing tasks were
 * missed and their locally merged status and priority were overwritten by the
 * provider on the next run.
 */

export const PAGE_SIZE = 1000;

/** Guard against a source that never returns a short page (e.g. unordered). */
const MAX_PAGES = 200;

export type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllRows<T>(
  page: (from: number, to: number) => Promise<PageResult<T>>,
  pageSize = PAGE_SIZE
): Promise<T[]> {
  const out: T[] = [];
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
    const from = pageIndex * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  throw new Error(`paginate: too many pages (over ${MAX_PAGES * pageSize} rows) — is the query ordered?`);
}
