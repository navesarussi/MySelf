import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The account a piece of background work acts for — a cron's per-account pass,
 * the WhatsApp webhook, an OAuth callback, an `after()` callback. Requests that
 * carry a session don't need this: `currentUserId()` reads their token.
 */
const store = new AsyncLocalStorage<string>();

export class NoUserContextError extends Error {
  constructor() {
    super("no_user_context");
    this.name = "NoUserContextError";
  }
}

export function runAsUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const id = userId.trim().toLowerCase();
  if (!id) throw new NoUserContextError();
  return store.run(id, fn);
}

export function explicitUserId(): string | undefined {
  return store.getStore();
}
