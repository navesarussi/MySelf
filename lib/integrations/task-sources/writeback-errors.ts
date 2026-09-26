export type WritebackErrorCode =
  | "integration_not_connected"
  | "integration_auth_failed"
  | "external_missing_ids"
  | "provider_not_found"
  | "monday_no_status_column"
  | "monday_no_reopen_label"
  | "monday_no_done_label"
  | "monday_board_not_found"
  | "external_api_failed";

/** Structured write-back failure — mapped to API codes and mobile Hebrew toasts. */
export class WritebackError extends Error {
  readonly code: WritebackErrorCode;
  /** When true the app may still apply the change locally (e.g. expired OAuth). */
  readonly localOnlyAllowed: boolean;

  constructor(code: WritebackErrorCode, message: string, localOnlyAllowed = false) {
    super(message);
    this.name = "WritebackError";
    this.code = code;
    this.localOnlyAllowed = localOnlyAllowed;
  }
}

export function classifyWritebackError(err: unknown): WritebackError {
  if (err instanceof WritebackError) return err;
  const msg = err instanceof Error ? err.message : String(err);

  if (msg === "not_connected") {
    return new WritebackError("integration_not_connected", msg, true);
  }
  if (msg === "missing_refresh_token" || msg.startsWith("token_refresh_failed")) {
    return new WritebackError("integration_auth_failed", msg, true);
  }
  if (msg === "external_missing_ids") {
    return new WritebackError("external_missing_ids", msg, true);
  }
  if (msg === "provider_not_found") {
    return new WritebackError("provider_not_found", msg, false);
  }
  if (msg === "monday_no_status_column") {
    return new WritebackError("monday_no_status_column", msg, false);
  }
  if (msg === "monday_no_reopen_label") {
    return new WritebackError("monday_no_reopen_label", msg, false);
  }
  if (msg === "monday_no_done_label") {
    return new WritebackError("monday_no_done_label", msg, false);
  }
  if (msg === "monday_board_not_found") {
    return new WritebackError("monday_board_not_found", msg, false);
  }

  return new WritebackError("external_api_failed", msg, false);
}

export function isIntegrationAuthError(code: WritebackErrorCode): boolean {
  return (
    code === "integration_not_connected" ||
    code === "integration_auth_failed" ||
    code === "external_missing_ids"
  );
}
