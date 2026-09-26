import { MondayGraphqlError } from "./monday/graphql";

export type WritebackErrorCode =
  | "integration_not_connected"
  | "integration_auth_failed"
  | "external_missing_ids"
  | "provider_not_found"
  | "monday_no_status_column"
  | "monday_no_reopen_label"
  | "monday_no_done_label"
  | "monday_board_not_found"
  | "monday_item_not_found"
  | "monday_permission_denied"
  | "external_not_found"
  | "external_permission_denied"
  | "external_api_failed";

/** Structured write-back failure — mapped to API codes and mobile Hebrew toasts. */
export class WritebackError extends Error {
  readonly code: WritebackErrorCode;
  /** When true the app may still apply the change locally (e.g. expired OAuth). */
  readonly localOnlyAllowed: boolean;
  /** Short Hebrew explanation for the user. */
  readonly userMessageHe?: string;

  constructor(
    code: WritebackErrorCode,
    message: string,
    localOnlyAllowed = false,
    userMessageHe?: string
  ) {
    super(message);
    this.name = "WritebackError";
    this.code = code;
    this.localOnlyAllowed = localOnlyAllowed;
    this.userMessageHe = userMessageHe;
  }
}

function mondayMessageFromGraphql(err: MondayGraphqlError): WritebackError {
  const joined = err.graphqlMessages.join(" ").toLowerCase();
  const body = err.body.toLowerCase();

  if (
    joined.includes("item not found") ||
    joined.includes("could not find item") ||
    joined.includes("invalid item")
  ) {
    return new WritebackError(
      "monday_item_not_found",
      err.message,
      true,
      "הפריט לא נמצא ב-Monday — ייתכן שנמחק או שאין גישה אליו"
    );
  }
  if (
    joined.includes("board not found") ||
    joined.includes("could not find board") ||
    joined.includes("invalid board")
  ) {
    return new WritebackError(
      "monday_board_not_found",
      err.message,
      true,
      "אין גישה ללוח Monday — בדוק שהלוח נבחר בהגדרות"
    );
  }
  if (
    err.status === 403 ||
    joined.includes("not authorized") ||
    joined.includes("unauthorized") ||
    joined.includes("permission") ||
    joined.includes("insufficient")
  ) {
    return new WritebackError(
      "monday_permission_denied",
      err.message,
      true,
      "אין הרשאה לעדכן פריט זה ב-Monday"
    );
  }
  if (joined.includes("column") && joined.includes("not found")) {
    return new WritebackError(
      "monday_no_status_column",
      err.message,
      true,
      "עמודת הסטטוס לא נמצאה בלוח — נסה סנכרון מחדש"
    );
  }
  if (joined.includes("label") || joined.includes("status")) {
    return new WritebackError(
      "external_api_failed",
      err.message,
      true,
      "Monday דחה את עדכון הסטטוס — ניתן לשמור מקומית בלבד"
    );
  }
  if (body.includes("invalid column value")) {
    return new WritebackError(
      "external_api_failed",
      err.message,
      true,
      "Monday דחה את ערך הסטטוס — ניתן לשמור מקומית בלבד"
    );
  }

  return new WritebackError(
    "external_api_failed",
    err.message,
    false,
    "שגיאה בעדכון Monday — נסה שוב או שמור מקומית"
  );
}

function classifyHttpApiError(msg: string, source: "google" | "github"): WritebackError {
  const statusMatch = msg.match(/:(\d{3}):/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;

  if (status === 401 || status === 403) {
    return new WritebackError(
      "external_permission_denied",
      msg,
      true,
      source === "github"
        ? "אין הרשאה לעדכן את ה-issue ב-GitHub"
        : "אין הרשאה לעדכן את המשימה ב-Google Tasks"
    );
  }
  if (status === 404) {
    return new WritebackError(
      "external_not_found",
      msg,
      true,
      source === "github"
        ? "ה-issue לא נמצא ב-GitHub — ייתכן שנסגר או נמחק"
        : "המשימה לא נמצאה ב-Google Tasks"
    );
  }
  return new WritebackError("external_api_failed", msg, false);
}

export function classifyWritebackError(err: unknown): WritebackError {
  if (err instanceof WritebackError) return err;
  if (err instanceof MondayGraphqlError) return mondayMessageFromGraphql(err);

  const msg = err instanceof Error ? err.message : String(err);

  if (msg === "not_connected") {
    return new WritebackError(
      "integration_not_connected",
      msg,
      true,
      "האינטגרציה מנותקת — התחבר מחדש בהגדרות"
    );
  }
  if (msg === "missing_refresh_token" || msg.startsWith("token_refresh_failed")) {
    return new WritebackError(
      "integration_auth_failed",
      msg,
      true,
      "פג תוקף החיבור — התחבר מחדש בהגדרות"
    );
  }
  if (msg === "external_missing_ids") {
    return new WritebackError(
      "external_missing_ids",
      msg,
      true,
      "חסרים מזהים — הרץ סנכרון משימות בהגדרות"
    );
  }
  if (msg === "provider_not_found") {
    return new WritebackError("provider_not_found", msg, false);
  }
  if (msg === "monday_no_status_column") {
    return new WritebackError(
      "monday_no_status_column",
      msg,
      true,
      "ללוח אין עמודת סטטוס — לא ניתן לסמן כבוצע ב-Monday"
    );
  }
  if (msg === "monday_no_reopen_label") {
    return new WritebackError(
      "monday_no_reopen_label",
      msg,
      true,
      "לא נמצא סטטוס פתוח בלוח — ניתן לשמור מקומית בלבד"
    );
  }
  if (msg === "monday_no_done_label") {
    return new WritebackError(
      "monday_no_done_label",
      msg,
      true,
      "לא נמצא סטטוס 'בוצע' בלוח — ניתן לשמור מקומית בלבד"
    );
  }
  if (msg === "monday_board_not_found") {
    return new WritebackError(
      "monday_board_not_found",
      msg,
      true,
      "אין גישה ללוח Monday — בדוק שהלוח נבחר בהגדרות"
    );
  }
  if (msg.startsWith("github_")) {
    return classifyHttpApiError(msg, "github");
  }
  if (msg.startsWith("complete_task_failed") || msg.startsWith("reopen_task_failed")) {
    return classifyHttpApiError(msg, "google");
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

const EXPECTED_MONDAY_WRITEBACK_CODES: ReadonlySet<WritebackErrorCode> = new Set([
  "monday_permission_denied",
  "monday_item_not_found",
  "monday_board_not_found",
  "monday_no_status_column",
  "monday_no_done_label",
  "monday_no_reopen_label",
]);

/** Expected Monday failures — log locally but do not spam the live error webhook. */
export function isExpectedMondayWritebackError(err: unknown): boolean {
  const classified = classifyWritebackError(err);
  return classified.localOnlyAllowed && EXPECTED_MONDAY_WRITEBACK_CODES.has(classified.code);
}

/** Skip archive fallback when complete already failed for a reason archive cannot fix. */
export function shouldSkipMondayArchiveFallback(completeErr: unknown): boolean {
  const classified = classifyWritebackError(completeErr);
  if (!classified.localOnlyAllowed) return false;
  return (
    classified.code === "monday_permission_denied" ||
    classified.code === "monday_item_not_found" ||
    classified.code === "monday_board_not_found"
  );
}

function writebackErrorRank(err: WritebackError): number {
  if (err.code === "monday_permission_denied" || err.code === "external_permission_denied") {
    return 0;
  }
  if (err.localOnlyAllowed) return 1;
  return 2;
}

/** When complete and archive both fail, prefer permission errors over generic failures. */
export function pickPreferredWritebackError(a: unknown, b: unknown): WritebackError {
  const ca = classifyWritebackError(a);
  const cb = classifyWritebackError(b);
  return writebackErrorRank(ca) <= writebackErrorRank(cb) ? ca : cb;
}

export const MONDAY_DELETE_HIDDEN_MESSAGE_HE =
  "אין הרשאה למחוק/לארכב ב-Monday — הסתרנו מהרשימה שלך";
