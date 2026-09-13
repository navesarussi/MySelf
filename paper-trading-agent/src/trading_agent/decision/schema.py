"""Strict decision contract shared by every LLM provider and the risk layer."""
from __future__ import annotations
from dataclasses import asdict, dataclass
from typing import Literal

Action = Literal["buy", "sell", "hold", "close"]
AssetClass = Literal["stock", "crypto"]


@dataclass(frozen=True)
class Decision:
    action: Action
    symbol: str
    size: float
    stop_loss: float | None
    take_profit: float | None
    asset_class: AssetClass
    reasoning: str

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


DECISION_FIELDS = frozenset({"action", "symbol", "size", "stop_loss", "take_profit", "asset_class", "reasoning"})
DECISION_JSON_SCHEMA: dict[str, object] = {
    "type": "object",
    "additionalProperties": False,
    "required": sorted(DECISION_FIELDS),
    "properties": {
        "action": {"enum": ["buy", "sell", "hold", "close"]},
        "symbol": {"type": "string"},
        "size": {"type": "number"},
        "stop_loss": {"type": ["number", "null"]},
        "take_profit": {"type": ["number", "null"]},
        "asset_class": {"enum": ["stock", "crypto"]},
        "reasoning": {"type": "string"},
    },
}
