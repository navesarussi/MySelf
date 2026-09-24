import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, readJson, str, denyUnlessPrimary } from "@/lib/api/auth";
import { decideCalibration, listParamSets, proposeCalibration, type BacktestPreset } from "@/lib/trading/service";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await listParamSets());
  } catch {
    return dbError();
  }
}

/** { action: "propose", preset, years } | { action: "approve" | "reject", id, confirm: true } */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  const body = await readJson(req);
  try {
    if (body.action === "propose") {
      const preset = (["CRYPTO", "STOCKS", "ALL"].includes(String(body.preset)) ? body.preset : "CRYPTO") as BacktestPreset;
      return NextResponse.json(await proposeCalibration({ preset, years: Number(body.years ?? 4) }));
    }
    if ((body.action === "approve" || body.action === "reject") && str(body.id)) {
      if (body.confirm !== true) return badRequest("confirmation_required");
      await decideCalibration(str(body.id), body.action === "approve");
      return NextResponse.json({ ok: true });
    }
    return badRequest("invalid_action");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "calibration_failed" }, { status: 409 });
  }
}
