"""Configuration and safety defaults loaded from environment variables."""
from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path

DEFAULT_SYMBOLS = ("AAPL", "MSFT", "NVDA", "SPY", "BTC/USD", "ETH/USD")
PAPER_URL = "https://paper-api.alpaca.markets"


def load_dotenv(path: Path = Path(".env")) -> None:
    """Load simple KEY=VALUE pairs without requiring a runtime dependency."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    alpaca_api_key: str | None
    alpaca_secret_key: str | None
    alpaca_base_url: str
    paper: bool
    openai_api_key: str | None
    anthropic_api_key: str | None
    openai_model: str
    anthropic_model: str
    allowed_symbols: frozenset[str]
    max_position_pct: float
    max_daily_loss_pct: float
    human_approval_threshold_usd: float
    approved: bool

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv()
        raw_symbols = os.getenv("ALLOWED_SYMBOLS", ",".join(DEFAULT_SYMBOLS))
        return cls(
            alpaca_api_key=os.getenv("ALPACA_API_KEY") or None,
            alpaca_secret_key=os.getenv("ALPACA_SECRET_KEY") or None,
            alpaca_base_url=os.getenv("ALPACA_BASE_URL", PAPER_URL).rstrip("/"),
            paper=_bool("PAPER", True),
            openai_api_key=os.getenv("OPENAI_API_KEY") or None,
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY") or None,
            openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            anthropic_model=os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest"),
            allowed_symbols=frozenset(s.strip().upper() for s in raw_symbols.split(",") if s.strip()),
            max_position_pct=float(os.getenv("MAX_POSITION_PCT", "0.05")),
            max_daily_loss_pct=float(os.getenv("MAX_DAILY_LOSS_PCT", "0.03")),
            human_approval_threshold_usd=float(os.getenv("HUMAN_APPROVAL_THRESHOLD_USD", "1000")),
            approved=_bool("APPROVE", False),
        )

    def validate_paper_only(self) -> None:
        if not self.paper or "paper-api.alpaca.markets" not in self.alpaca_base_url:
            raise ValueError("Paper-only v1 refuses live trading flags or non-paper Alpaca base URLs.")
