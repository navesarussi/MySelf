from __future__ import annotations
from dataclasses import dataclass, field
from trading_agent.decision.schema import Decision


@dataclass
class MockBroker:
    """Offline broker used only for dry-runs and unit-level development."""
    equity: float = 100_000.0
    positions: dict[str, float] = field(default_factory=dict)
    prices: dict[str, float] = field(default_factory=lambda: {"AAPL": 200.0, "MSFT": 400.0, "NVDA": 120.0, "SPY": 500.0, "BTC/USD": 60_000.0, "ETH/USD": 3_000.0})
    name: str = "mock"

    def get_equity(self) -> float: return self.equity
    def get_positions(self) -> dict[str, float]: return dict(self.positions)
    def get_market_data(self, symbol: str) -> dict[str, float]: return {"price": self.prices.get(symbol, 100.0)}
    def place_order(self, decision: Decision) -> dict[str, object]:
        self.positions[decision.symbol] = self.positions.get(decision.symbol, 0.0) + (decision.size if decision.action == "buy" else -decision.size)
        return {"status": "filled", "symbol": decision.symbol, "paper": True}
    def cancel_order(self, order_id: str) -> None: return None
