import { NextRequest, NextResponse } from "next/server";
import { dbError, denyUnlessPrimary } from "@/lib/api/auth";
import { getLearningView } from "@/lib/trading/service";

/** הסוכן מסחר's self-learning: post-trade lessons and the playbook built from them. */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await getLearningView());
  } catch {
    return dbError();
  }
}
