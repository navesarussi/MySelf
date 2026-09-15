from trading_agent.broker.alpaca_paper import AlpacaPaperBroker
from trading_agent.broker.mock import MockBroker
from trading_agent.config import Settings


def paper_settings() -> Settings:
    return Settings(
        alpaca_api_key="key", alpaca_secret_key="secret",
        alpaca_base_url="https://paper-api.alpaca.markets", paper=True,
        openai_api_key=None, anthropic_api_key=None,
        openai_model="test", anthropic_model="test",
        allowed_symbols=frozenset({"AAPL"}), max_position_pct=0.05,
        max_daily_loss_pct=0.03, human_approval_threshold_usd=1_000,
        approved=False,
    )


def test_alpaca_daily_pnl_uses_equity_minus_last_equity(monkeypatch):
    broker = AlpacaPaperBroker(paper_settings())
    monkeypatch.setattr(broker, "_request", lambda *_: {"equity": "102500", "last_equity": "100000"})
    assert broker.get_daily_pnl() == 2_500.0


def test_mock_daily_pnl_is_configurable():
    assert MockBroker(daily_pnl=-321.5).get_daily_pnl() == -321.5
