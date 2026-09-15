"""Reject non-JSON or schema drift rather than guessing an LLM's intent."""
from __future__ import annotations
import json
from .schema import DECISION_FIELDS, Decision


class DecisionParseError(ValueError):
    pass


def parse_decision(raw: str) -> Decision:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise DecisionParseError("Decision must be one strict JSON object; markdown and free text are rejected.") from exc
    if not isinstance(payload, dict):
        raise DecisionParseError("Decision must be a JSON object.")
    keys = frozenset(payload)
    if keys != DECISION_FIELDS:
        missing, extra = DECISION_FIELDS - keys, keys - DECISION_FIELDS
        raise DecisionParseError(f"Decision fields must match exactly; missing={sorted(missing)}, extra={sorted(extra)}.")
    if payload["action"] not in {"buy", "sell", "hold", "close"}:
        raise DecisionParseError("Invalid action.")
    if payload["asset_class"] not in {"stock", "crypto"}:
        raise DecisionParseError("Invalid asset_class.")
    if not isinstance(payload["symbol"], str) or not payload["symbol"].strip():
        raise DecisionParseError("symbol must be a non-empty string.")
    if isinstance(payload["size"], bool) or not isinstance(payload["size"], (int, float)):
        raise DecisionParseError("size must be a number.")
    for name in ("stop_loss", "take_profit"):
        if payload[name] is not None and (isinstance(payload[name], bool) or not isinstance(payload[name], (int, float))):
            raise DecisionParseError(f"{name} must be a number or null.")
    if not isinstance(payload["reasoning"], str):
        raise DecisionParseError("reasoning must be a string.")
    return Decision(**payload)
