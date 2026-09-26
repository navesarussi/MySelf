import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunk, fetchAllRows, fetchAllRowsParallel, PAGE_SIZE } from "../db/paginate";

type Row = { id: string };

/**
 * A page source that records how it was called, so the test can assert the
 * caller ordered its query — `range()` over an unordered query is not stable
 * in Postgres, which is the defect this exists to prevent.
 */
function source(rows: Row[], opts: { ordered?: boolean } = {}) {
  const ranges: [number, number][] = [];
  const page = async (from: number, to: number) => {
    ranges.push([from, to]);
    const slice = opts.ordered === false ? [...rows].reverse() : rows;
    return { data: slice.slice(from, to + 1), error: null };
  };
  return { page, ranges };
}

describe("fetchAllRows", () => {
  it("returns every row across pages", async () => {
    const rows = Array.from({ length: PAGE_SIZE * 2 + 7 }, (_, i) => ({ id: `t${i}` }));
    const { page, ranges } = source(rows);
    const out = await fetchAllRows<Row>(page);
    assert.equal(out.length, rows.length);
    assert.deepEqual(
      out.map((r) => r.id),
      rows.map((r) => r.id)
    );
    assert.deepEqual(ranges[0], [0, PAGE_SIZE - 1]);
    assert.deepEqual(ranges[1], [PAGE_SIZE, PAGE_SIZE * 2 - 1]);
    assert.equal(ranges.length, 3, "a short final page ends the walk");
  });

  /**
   * The mark-done query read a single unpaginated page, so past PostgREST's
   * default row cap the tasks beyond it were invisible and never closed.
   */
  it("keeps going past a single page instead of stopping at the cap", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({ id: `t${i}` }));
    const out = await fetchAllRows<Row>(source(rows).page);
    assert.equal(out.length, PAGE_SIZE + 1);
  });

  it("stops on an exactly-full final page without an extra empty request", async () => {
    const rows = Array.from({ length: PAGE_SIZE * 2 }, (_, i) => ({ id: `t${i}` }));
    const { page, ranges } = source(rows);
    const out = await fetchAllRows<Row>(page);
    assert.equal(out.length, PAGE_SIZE * 2);
    assert.equal(ranges.length, 3, "one empty probe is expected, never a loop");
  });

  it("handles an empty table", async () => {
    const { page, ranges } = source([]);
    assert.deepEqual(await fetchAllRows<Row>(page), []);
    assert.equal(ranges.length, 1);
  });

  it("propagates an error instead of returning a short list", async () => {
    await assert.rejects(
      fetchAllRows<Row>(async () => ({ data: null, error: { message: "boom" } })),
      /boom/
    );
  });

  it("refuses to walk forever if the source keeps returning full pages", async () => {
    // A misconfigured source (no ordering, repeating rows) must fail loudly
    // rather than paging until the request times out.
    await assert.rejects(
      fetchAllRows<Row>(async () => ({
        data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: `t${i}` })),
        error: null,
      })),
      /too many pages/i
    );
  });
});

describe("chunk", () => {
  it("splits a list into batches of at most `size`", () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
    assert.deepEqual(chunk([1, 2, 3], 10), [[1, 2, 3]]);
  });

  it("handles an empty list and a degenerate size", () => {
    assert.deepEqual(chunk([], 5), []);
    assert.deepEqual(chunk([1, 2], 0), [[1], [2]], "size 0 must not loop forever");
    assert.deepEqual(chunk([1, 2], -3), [[1], [2]]);
  });

  /**
   * Why this exists: an `.in(column, ids)` filter returns one row per match, so
   * a list of N ids whose rows fan out K-wide silently truncates at PostgREST's
   * row cap once N×K reaches it. Chunking keeps every request far below it.
   */
  it("keeps 500 ids fanning out 2-wide under the row cap", () => {
    const ids = Array.from({ length: 500 }, (_, i) => i);
    for (const batch of chunk(ids, 200)) {
      assert.ok(batch.length * 2 < PAGE_SIZE, `${batch.length} ids × 2 rows must stay under ${PAGE_SIZE}`);
    }
  });
});

describe("fetchAllRowsParallel", () => {
  const rows = Array.from({ length: PAGE_SIZE * 3 + 5 }, (_, i) => ({ id: `t${i}` }));

  it("returns every row in order, counting only on the first page", async () => {
    const calls: [number, boolean][] = [];
    const out = await fetchAllRowsParallel<Row>(async (from, to, withCount) => {
      calls.push([from, withCount]);
      return { data: rows.slice(from, to + 1), error: null, count: withCount ? rows.length : null };
    });
    assert.deepEqual(out.map((r) => r.id), rows.map((r) => r.id));
    assert.equal(calls.length, 4);
    assert.deepEqual(calls.filter(([, c]) => c), [[0, true]]);
  });

  it("requests the later pages without waiting for each other", async () => {
    let inFlight = 0;
    let peak = 0;
    await fetchAllRowsParallel<Row>(async (from, to, withCount) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { data: rows.slice(from, to + 1), error: null, count: withCount ? rows.length : null };
    });
    assert.equal(peak, 3);
  });

  it("stops after one request when the first page is short", async () => {
    let calls = 0;
    const out = await fetchAllRowsParallel<Row>(async () => {
      calls++;
      return { data: rows.slice(0, 10), error: null, count: 10 };
    });
    assert.equal(out.length, 10);
    assert.equal(calls, 1);
  });

  it("walks pages in order when no count comes back", async () => {
    const out = await fetchAllRowsParallel<Row>(async (from, to) => ({
      data: rows.slice(from, to + 1),
      error: null,
      count: null,
    }));
    assert.equal(out.length, rows.length);
  });

  it("surfaces a failed page as an error", async () => {
    await assert.rejects(
      fetchAllRowsParallel<Row>(async (from, to, withCount) =>
        from === PAGE_SIZE * 2
          ? { data: null, error: { message: "boom" } }
          : { data: rows.slice(from, to + 1), error: null, count: withCount ? rows.length : null }
      ),
      /boom/
    );
  });
});
