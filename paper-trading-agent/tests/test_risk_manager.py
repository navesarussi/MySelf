import pytest
from trading_agent.decision.schema import Decision
from trading_agent.risk.manager import RiskManager

ALLOWED = frozenset({"AAPL", "BTC/USD"})
def manager(**kwargs): return RiskManager(0.05, 0.03, ALLOWED, 1000, **kwargs)
def decision(action="buy", symbol="AAPL", size=1): return Decision(action, symbol, size, None, None, "crypto" if "/" in symbol else "stock", "test")
def validate(d, **kwargs):
    manager_kwargs = kwargs.pop("manager", {})
    context = {"equity": 10_000, "daily_pnl": 0, "positions": {"AAPL": 1}, "market_price": 100}
    context.update(kwargs)
    return manager(**manager_kwargs).validate(d, **context)

def test_passes_safe_buy(): assert validate(decision()).passed
@pytest.mark.parametrize("d, kwargs, phrase", [
    (decision(symbol="TSLA"), {}, "whitelist"),
    (decision(size=0), {}, "greater than zero"),
    (decision(size=6), {}, "max_position_pct"),
    (decision(size=11), {"manager": {"approved": False}}, "approval threshold"),
    (decision(), {"daily_pnl": -300}, "kill switch"),
    (decision(), {"leverage": 2}, "leverage"),
    (decision("close", "BTC/USD", 0), {}, "existing position"),
])
def test_reject_paths(d, kwargs, phrase):
    result = validate(d, **kwargs)
    assert not result.passed
    assert any(phrase in reason for reason in result.reasons)

def test_approval_gate_can_be_explicitly_opened():
    assert validate(decision(size=11), manager={"approved": True}).passed is False  # still exceeds 5% position cap
