import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getLearningView } from "@/lib/trading/service";

/** הסוכן מסחר's self-learning: post-trade lessons and the playbook built from them. */
export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  try {
    return NextResponse.json(await getLearningView());
  } catch {
    return dbError();
  }
}
