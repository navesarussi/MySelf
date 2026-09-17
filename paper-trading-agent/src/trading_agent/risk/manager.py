"""Deterministic policy is deliberately outside the LLM trust boundary."""
from __future__ import annotations
from dataclasses import dataclass
from trading_agent.decision.schema import Decision


@dataclass(frozen=True)
class RiskResult:
    passed: bool
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class RiskManager:
    max_position_pct: float
    max_daily_loss_pct: float
    allowed_symbols: frozenset[str]
    human_approval_threshold_usd: float
    approved: bool = False

    def validate(self, decision: Decision, *, equity: float, daily_pnl: float, positions: dict[str, float], market_price: float, leverage: float = 1.0) -> RiskResult:
        reasons: list[str] = []
        symbol = decision.symbol.upper()
        if symbol not in self.allowed_symbols:
            reasons.append("symbol is not on the asset whitelist")
        if leverage > 1:
            reasons.append("leverage greater than 1 is not supported in v1")
        risk_increasing = decision.action in {"buy", "sell"}
        if equity > 0 and daily_pnl / equity <= -self.max_daily_loss_pct and risk_increasing:
            reasons.append("daily loss kill switch is active")
        if decision.action in {"buy", "sell"} and decision.size <= 0:
            reasons.append("size must be greater than zero for buy/sell")
        if decision.action == "close" and symbol not in positions:
            reasons.append("close requires an existing position")
        notional = abs(decision.size * market_price)
        if risk_increasing and notional > self.human_approval_threshold_usd and not self.approved:
            reasons.append("notional exceeds approval threshold; set APPROVE=1")
        if decision.action == "buy" and equity > 0 and notional > equity * self.max_position_pct:
            reasons.append("buy notional exceeds max_position_pct")
        return RiskResult(passed=not bool(reasons), reasons=tuple(reasons))
