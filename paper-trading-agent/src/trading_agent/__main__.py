from __future__ import annotations
import argparse
import sys
from trading_agent.broker.alpaca_paper import AlpacaPaperBroker
from trading_agent.broker.mock import MockBroker
from trading_agent.config import Settings
from trading_agent.loop.cycle import run_decision_cycle


def main() -> int:
    parser = argparse.ArgumentParser(description="Run one safe, paper-only decision cycle.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    run = subparsers.add_parser("run")
    run.add_argument("--symbol", required=True)
    run.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    settings = Settings.from_env()
    if args.dry_run and (not settings.alpaca_api_key or not settings.alpaca_secret_key):
        print("No Alpaca paper keys found; using MockBroker for offline dry-run.", file=sys.stderr)
        broker = MockBroker()
    elif not args.dry_run and (not settings.alpaca_api_key or not settings.alpaca_secret_key):
        print("ALPACA_API_KEY and ALPACA_SECRET_KEY are required without --dry-run.", file=sys.stderr)
        return 2
    else:
        try:
            broker = AlpacaPaperBroker(settings)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 2
    result = run_decision_cycle(args.symbol, settings=settings, broker=broker, dry_run=args.dry_run)
    print(f"risk_passed={result.risk.passed} executed={result.executed} reasons={list(result.risk.reasons)}")
    return 0 if result.risk.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
