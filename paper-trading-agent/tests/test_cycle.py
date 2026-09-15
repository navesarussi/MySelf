import json
from trading_agent.broker.mock import MockBroker
from trading_agent.config import Settings
from trading_agent.loop.cycle import run_decision_cycle


def settings() -> Settings:
    return Settings(
        alpaca_api_key=None, alpaca_secret_key=None,
        alpaca_base_url="https://paper-api.alpaca.markets", paper=True,
        openai_api_key=None, anthropic_api_key=None,
        openai_model="test", anthropic_model="test",
        allowed_symbols=frozenset({"AAPL"}), max_position_pct=0.05,
        max_daily_loss_pct=0.03, human_approval_threshold_usd=1_000,
        approved=True,
    )


def test_cycle_passes_broker_daily_pnl_to_kill_switch(monkeypatch, tmp_path):
    raw = json.dumps({"action": "buy", "symbol": "AAPL", "size": 1, "stop_loss": None, "take_profit": None, "asset_class": "stock", "reasoning": "test"})
    monkeypatch.setattr("trading_agent.loop.cycle.decide", lambda *_: raw)
    monkeypatch.setattr("trading_agent.loop.cycle.append_decision", lambda **_: None)
    broker = MockBroker(equity=10_000, daily_pnl=-300)

    result = run_decision_cycle("AAPL", settings=settings(), broker=broker, dry_run=True)

    assert not result.risk.passed
    assert "daily loss kill switch is active" in result.risk.reasons
