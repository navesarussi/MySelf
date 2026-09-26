const TOKEN_EXPIRED = new Set([
  "not_connected",
  "integration_not_connected",
  "integration_auth_failed",
  "missing_refresh_token",
  "token_expired",
  "gmail_unauthorized",
  "external_missing_ids",
]);

const TOKEN_EXPIRED_PREFIX = ["token_refresh_failed"];

const LOCAL_ONLY_WRITEBACK = new Set([
  "monday_permission_denied",
  "monday_item_not_found",
  "monday_board_not_found",
  "monday_no_status_column",
  "monday_no_done_label",
  "monday_no_reopen_label",
  "external_not_found",
  "external_permission_denied",
]);

export function isNoiseError(input: {
  error: unknown;
  httpStatus?: number;
  message?: string;
}): boolean {
  const status = input.httpStatus;
  if (status === 401) return true;

  const message =
    input.message ??
    (input.error instanceof Error ? input.error.message : String(input.error ?? ""));

  const name = input.error instanceof Error ? input.error.name : "";
  if (name === "AbortError") return true;

  const lower = message.toLowerCase();
  if (
    lower.includes("aborterror") ||
    lower.includes("request aborted") ||
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("client offline") ||
    lower.includes("network error") ||
    lower.includes("econnreset") ||
    lower.includes("econnaborted") ||
    lower.includes("etimedout") ||
    lower.includes("socket hang up")
  ) {
    return true;
  }

  if (TOKEN_EXPIRED.has(message)) return true;
  if (LOCAL_ONLY_WRITEBACK.has(message)) return true;
  if (TOKEN_EXPIRED_PREFIX.some((p) => message.startsWith(p))) return true;

  if (lower.includes("user unauthorized to perform action")) return true;
  if (lower.includes("userunauthorizedexception")) return true;
  if (name === "MondayGraphqlError" && lower.includes("unauthorized")) return true;

  return false;
}
