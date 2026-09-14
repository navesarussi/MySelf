import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getUniverseView } from "@/lib/trading/service";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  try {
    return NextResponse.json(await getUniverseView());
  } catch {
    return dbError();
  }
}
