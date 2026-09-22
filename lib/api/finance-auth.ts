import { NextRequest } from "next/server";
import { isApiAuthorized } from "@/lib/api/auth";
import { matchesAnySecret } from "@/lib/api/cron-auth";

/** Session cookie/Bearer OR FINANCE_INGEST_TOKEN for Shortcuts + GitHub Actions. */
export async function isFinanceIngestAuthorized(req: NextRequest): Promise<boolean> {
  if (await isApiAuthorized(req)) return true;
  return matchesAnySecret(req.headers.get("authorization"), [process.env.FINANCE_INGEST_TOKEN]);
}
