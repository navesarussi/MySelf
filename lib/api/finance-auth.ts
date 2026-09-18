import { NextRequest } from "next/server";
import { isApiAuthorized } from "@/lib/api/auth";
import { safeEqual } from "@/lib/auth";

/** Session cookie/Bearer OR FINANCE_INGEST_TOKEN for Shortcuts + GitHub Actions. */
export async function isFinanceIngestAuthorized(req: NextRequest): Promise<boolean> {
  if (await isApiAuthorized(req)) return true;
  const secret = process.env.FINANCE_INGEST_TOKEN?.trim();
  if (!secret) return false;
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  return bearer !== undefined && safeEqual(bearer, secret);
}
