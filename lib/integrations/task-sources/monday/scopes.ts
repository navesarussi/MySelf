import { WritebackError } from "../writeback-errors";
import { getIntegrationToken } from "../../tokens";
import { MONDAY_PROVIDER } from "../../monday-config";

/** When scope was persisted at connect time, require boards:write before mutating. */
export function mondayScopeIncludesWrite(scope: string | undefined | null): boolean {
  if (!scope) return true;
  return scope.split(/\s+/).some((s) => s === "boards:write");
}

export async function assertMondayWriteScope(accountKey: string): Promise<void> {
  const row = await getIntegrationToken(MONDAY_PROVIDER, accountKey);
  if (!row) throw new Error("not_connected");
  const scope = row.settings?.oauth_scope;
  if (typeof scope !== "string" || !scope.trim()) return;
  if (mondayScopeIncludesWrite(scope)) return;
  throw new WritebackError(
    "integration_auth_failed",
    "monday_missing_write_scope",
    true,
    "חסרה הרשאת כתיבה ל-Monday — התחבר מחדש בהגדרות"
  );
}
