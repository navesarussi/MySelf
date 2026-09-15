from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path


def append_decision(*, symbol: str, raw_decision: str, risk_result: dict[str, object], executed: bool, dry_run: bool, broker: str, path: Path = Path("logs/decisions.jsonl")) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    event = {"timestamp": datetime.now(timezone.utc).isoformat(), "symbol": symbol, "raw_decision": raw_decision, "risk_result": risk_result, "executed": executed, "dry_run": dry_run, "broker": broker}
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(event, ensure_ascii=False) + "\n")
