import { NextRequest, NextResponse } from "next/server";
import { badRequest, denyUnlessPrimary } from "@/lib/api/auth";
import { livePrice } from "@/lib/trading/intraday-data";

export const maxDuration = 10;

/** Latest trade price for the live ticker (stocks: Alpaca IEX; crypto clients prefer the Binance stream directly). */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase();
  const assetClass = req.nextUrl.searchParams.get("asset_class") === "STOCK" ? "STOCK" : "CRYPTO_ALT";
  if (!/^[A-Z0-9]{1,12}$/.test(symbol)) return badRequest("invalid_symbol");
  const price = await livePrice({ symbol, asset_class: assetClass, provider_symbol: assetClass === "STOCK" ? symbol : `${symbol}USDT` });
  return price ? NextResponse.json({ symbol, price, at: Date.now() }) : NextResponse.json({ error: "no_price" }, { status: 503 });
}
