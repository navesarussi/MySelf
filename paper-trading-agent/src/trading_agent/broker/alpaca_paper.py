"""Small stdlib-only adapter for Alpaca's paper trading REST API."""
from __future__ import annotations
import json
from urllib.request import Request, urlopen
from urllib.parse import quote
from trading_agent.config import Settings
from trading_agent.decision.schema import Decision


def normalize_symbol(symbol: str, asset_class: str) -> str:
    symbol = symbol.strip().upper().replace("-", "/")
    if asset_class == "crypto":
        return symbol.replace("/", "")  # Alpaca accepts BTCUSD order symbols.
    return symbol.replace("/", "")


class AlpacaPaperBroker:
    name = "alpaca-paper"

    def __init__(self, settings: Settings) -> None:
        settings.validate_paper_only()
        if not settings.alpaca_api_key or not settings.alpaca_secret_key:
            raise ValueError("ALPACA_API_KEY and ALPACA_SECRET_KEY are required for non-dry-run execution.")
        self.base_url, self.key, self.secret = settings.alpaca_base_url, settings.alpaca_api_key, settings.alpaca_secret_key

    def _request(self, method: str, path: str, payload: dict[str, object] | None = None, *, base_url: str | None = None) -> object:
        body = json.dumps(payload).encode() if payload is not None else None
        root = (base_url or self.base_url).rstrip("/")
        request = Request(root + path, data=body, method=method, headers={"APCA-API-KEY-ID": self.key, "APCA-API-SECRET-KEY": self.secret, "Content-Type": "application/json"})
        with urlopen(request, timeout=15) as response:  # nosec B310: trading URL validated paper-only; market data uses data.alpaca.markets
            return json.loads(response.read().decode())

    def _account(self) -> dict[str, object]:
        account = self._request("GET", "/v2/account")
        if not isinstance(account, dict):
            raise ValueError("Alpaca returned an invalid account response.")
        return account

    def get_equity(self) -> float:
        return float(self._account()["equity"])

    def get_daily_pnl(self) -> float:
        """Calculate today's realized/unrealized change from Alpaca account values.

        Alpaca's ``last_equity`` is the account equity from the previous trading
        day close. At the beginning of a trading day it can equal ``equity``,
        which correctly yields a zero daily P&L.
        """
        account = self._account()
        return float(account["equity"]) - float(account["last_equity"])

    def get_positions(self) -> dict[str, float]:
        positions = self._request("GET", "/v2/positions")
        return {item["symbol"]: float(item["qty"]) for item in positions}

    def get_market_data(self, symbol: str) -> dict[str, float]:
        # Market data lives on data.alpaca.markets, not the paper trading host.
        data = self._request(
            "GET",
            f"/v2/stocks/{quote(symbol, safe='')}/trades/latest",
            base_url="https://data.alpaca.markets",
        )
        if not isinstance(data, dict) or "trade" not in data:
            raise ValueError(f"Alpaca market data missing trade for {symbol}: {data!r}")
        return {"price": float(data["trade"]["p"])}

    def place_order(self, decision: Decision) -> dict[str, object]:
        payload: dict[str, object] = {"symbol": normalize_symbol(decision.symbol, decision.asset_class), "side": "sell" if decision.action in {"sell", "close"} else "buy", "type": "market", "time_in_force": "gtc" if decision.asset_class == "crypto" else "day"}
        if decision.action == "close":
            return self._request("DELETE", f"/v2/positions/{quote(payload['symbol'], safe='')}")
        payload["qty"] = str(decision.size)
        return self._request("POST", "/v2/orders", payload)

    def cancel_order(self, order_id: str) -> None:
        self._request("DELETE", f"/v2/orders/{quote(order_id, safe='')}")
