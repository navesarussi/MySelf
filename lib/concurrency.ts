/**
 * Bounded-concurrency map.
 *
 * Three copies of this existed (intraday-data, intraday-universe, finance
 * ingest) plus several serial loops that should have had one. Each worker pulls
 * the next item as it finishes, so a slow item does not idle the others the way
 * fixed-size batching does.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  const size = Math.max(1, Math.min(limit, items.length));
  if (items.length === 0) return;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        await fn(items[index], index);
      }
    })
  );
}
