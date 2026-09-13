from __future__ import annotations
from dataclasses import asdict, dataclass
from trading_agent.broker.protocol import BrokerClient
from trading_agent.config import Settings
from trading_agent.decision.llm import decide
from trading_agent.decision.parse import DecisionParseError, parse_decision
from trading_agent.logging.decisions import append_decision
from trading_agent.risk.manager import RiskManager, RiskResult


@dataclass(frozen=True)
class CycleResult:
    executed: bool
    risk: RiskResult
    raw_decision: str


def run_decision_cycle(symbol: str, *, settings: Settings, broker: BrokerClient, dry_run: bool) -> CycleResult:
    symbol = symbol.upper()
    asset_class = "crypto" if "/" in symbol else "stock"
    market_data = broker.get_market_data(symbol)
    raw = decide(settings, symbol, asset_class, market_data)
    try:
        decision = parse_decision(raw)
    except DecisionParseError as exc:
        risk = RiskResult(False, (f"decision parse rejected: {exc}",))
        append_decision(symbol=symbol, raw_decision=raw, risk_result=asdict(risk), executed=False, dry_run=dry_run, broker=broker.name)
        return CycleResult(False, risk, raw)
    manager = RiskManager(settings.max_position_pct, settings.max_daily_loss_pct, settings.allowed_symbols, settings.human_approval_threshold_usd, settings.approved)
    risk = manager.validate(decision, equity=broker.get_equity(), daily_pnl=0.0, positions=broker.get_positions(), market_price=market_data["price"])
    executed = False
    if risk.passed and decision.action not in {"hold"} and not dry_run:
        broker.place_order(decision)
        executed = True
    append_decision(symbol=symbol, raw_decision=raw, risk_result=asdict(risk), executed=executed, dry_run=dry_run, broker=broker.name)
    return CycleResult(executed, risk, raw)
