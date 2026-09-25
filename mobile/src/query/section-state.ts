/** True on first fetch with no cached/persisted data yet. */
export function isInitialLoad(loading: boolean, data: unknown): boolean {
  return loading && data == null;
}
