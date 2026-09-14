import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, readJson, unauthorized } from "@/lib/api/auth";
import { listBacktests, runAndStoreBacktest, type BacktestPreset } from "@/lib/trading/service";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  try {
    return NextResponse.json(await listBacktests());
  } catch {
    return dbError();
  }
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const preset = (["CRYPTO", "STOCKS", "ALL"].includes(String(body.preset)) ? body.preset : "CRYPTO") as BacktestPreset;
  const years = Number(body.years ?? 3);
  if (!(years >= 0.25 && years <= 8)) return badRequest("invalid_years");
  try {
    return NextResponse.json(await runAndStoreBacktest({ preset, years, symbols: Array.isArray(body.symbols) ? body.symbols.map(String) : undefined }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "backtest_failed" }, { status: 500 });
  }
}
