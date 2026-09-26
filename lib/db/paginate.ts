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

export type CountedPageResult<T> = PageResult<T> & { count?: number | null };

/**
 * Same result as fetchAllRows, but the pages after the first are fetched in
 * parallel. The first page is requested with an exact count (the caller passes
 * `{ count: "exact" }` when `withCount` is true), which says how many pages
 * remain. For a read that spans several pages on a user-facing request — the
 * whole timeline is four — this is one round trip plus one, not four in a row.
 *
 * Rows that land between the count and the later pages can shift a row across
 * a page boundary, as with any offset paging; the caller's ORDER BY must be
 * total (end with a unique column) for pages to be disjoint.
 */
export async function fetchAllRowsParallel<T>(
  page: (from: number, to: number, withCount: boolean) => Promise<CountedPageResult<T>>,
  pageSize = PAGE_SIZE
): Promise<T[]> {
  const first = await page(0, pageSize - 1, true);
  if (first.error) throw new Error(first.error.message);
  const firstRows = first.data ?? [];
  if (firstRows.length < pageSize) return firstRows;
  // No count: fall back to walking pages in order.
  if (first.count == null) {
    const rest = await fetchAllRows((from, to) => page(from + pageSize, to + pageSize, false), pageSize);
    return [...firstRows, ...rest];
  }
  const pageCount = Math.ceil(first.count / pageSize);
  if (pageCount > MAX_PAGES) {
    throw new Error(`paginate: too many pages (over ${MAX_PAGES * pageSize} rows)`);
  }
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, async (_, i) => {
      const from = (i + 1) * pageSize;
      const { data, error } = await page(from, from + pageSize - 1, false);
      if (error) throw new Error(error.message);
      return data ?? [];
    })
  );
  return [...firstRows, ...rest.flat()];
}

/**
 * Split a list of ids into batches for an `.in(column, ids)` filter.
 *
 * Such a filter returns one row per *match*, not per id, so a list whose rows
 * fan out K-wide silently truncates at the row cap once ids × K reaches it —
 * and the rows that survive are whichever the database returned first, which is
 * not a random sample. Chunking keeps every request far below the cap.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
  return out;
}
