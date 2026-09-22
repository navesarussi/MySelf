import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "../concurrency";

const tick = () => new Promise((r) => setImmediate(r));

describe("mapWithConcurrency", () => {
  it("visits every item exactly once, with its index", async () => {
    const seen: [string, number][] = [];
    await mapWithConcurrency(["a", "b", "c", "d", "e"], 2, async (item, i) => {
      await tick();
      seen.push([item, i]);
    });
    assert.equal(seen.length, 5);
    assert.deepEqual(
      seen.map(([item]) => item).sort(),
      ["a", "b", "c", "d", "e"]
    );
    for (const [item, i] of seen) assert.equal("abcde"[i], item);
  });

  it("never runs more than `limit` at once", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
    });
    assert.equal(peak, 4);
  });

  it("keeps workers busy instead of waiting for a batch to drain", async () => {
    // One slow item must not stop the other workers from finishing the rest.
    const order: number[] = [];
    await mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (n) => {
      if (n === 0) for (let i = 0; i < 10; i++) await tick();
      else await tick();
      order.push(n);
    });
    assert.equal(order.length, 6);
    assert.notEqual(order[0], 0, "the slow item should finish late, not gate the pool");
  });

  it("handles an empty list and a limit larger than the list", async () => {
    let calls = 0;
    await mapWithConcurrency([], 5, async () => void calls++);
    assert.equal(calls, 0);
    await mapWithConcurrency([1, 2], 99, async () => void calls++);
    assert.equal(calls, 2);
  });

  it("treats a zero or negative limit as one worker rather than doing nothing", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3], 0, async (n) => {
      seen.push(n);
    });
    assert.deepEqual(seen, [1, 2, 3]);
  });

  it("propagates a rejection", async () => {
    await assert.rejects(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
      }),
      /boom/
    );
  });
});
