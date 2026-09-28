import { NextRequest, NextResponse } from "next/server";
import { badRequest, denyUnlessPrimary } from "@/lib/api/auth";
import { livePrice } from "@/lib/trading/intraday-data";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const maxDuration = 10;

/** Latest tradable price for the live ticker (stocks: Alpaca IEX with snapshot fallback; crypto clients prefer the Binance stream). */
export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase();
  const assetClass = req.nextUrl.searchParams.get("asset_class") === "STOCK" ? "STOCK" : "CRYPTO_ALT";
  if (!/^[A-Z0-9]{1,12}$/.test(symbol)) return badRequest("invalid_symbol");
  const price = await livePrice({ symbol, asset_class: assetClass, provider_symbol: assetClass === "STOCK" ? symbol : `${symbol}USDT` });
  return NextResponse.json({ symbol, price: price ?? null, at: Date.now() });
});
