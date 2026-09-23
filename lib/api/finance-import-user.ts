import type { NextRequest } from "next/server";
import { sessionIdentity } from "@/lib/api/auth";

/** Owner id for finance import rows — session email or legacy single-user fallback. */
export async function financeImportUserId(req: NextRequest): Promise<string> {
  const identity = await sessionIdentity(req);
  return identity?.sub?.trim() || "owner";
}
