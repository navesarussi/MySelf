"""HTTP-only LLM clients. Their output remains untrusted until risk validation."""
from __future__ import annotations
import json
from urllib.request import Request, urlopen
from trading_agent.config import Settings

SYSTEM_PROMPT = "Respond ONLY with this JSON object; no markdown fences. Required exact fields: action (buy|sell|hold|close), symbol, size, stop_loss, take_profit, asset_class (stock|crypto), reasoning."


def _post(url: str, headers: dict[str, str], payload: dict[str, object]) -> dict[str, object]:
    request = Request(url, data=json.dumps(payload).encode(), method="POST", headers={**headers, "Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:  # nosec B310: fixed provider endpoint
        return json.loads(response.read().decode())


def decide(settings: Settings, symbol: str, asset_class: str, market_data: dict[str, float]) -> str:
    if settings.openai_api_key:
        data = _post("https://api.openai.com/v1/chat/completions", {"Authorization": f"Bearer {settings.openai_api_key}"}, {"model": settings.openai_model, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": f"Symbol={symbol}; asset_class={asset_class}; market_data={market_data}"}]})
        return data["choices"][0]["message"]["content"]
    if settings.anthropic_api_key:
        data = _post("https://api.anthropic.com/v1/messages", {"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01"}, {"model": settings.anthropic_model, "max_tokens": 300, "system": SYSTEM_PROMPT, "messages": [{"role": "user", "content": f"Symbol={symbol}; asset_class={asset_class}; market_data={market_data}"}]})
        return data["content"][0]["text"]
    return json.dumps({"action": "hold", "symbol": symbol, "size": 0.0, "stop_loss": None, "take_profit": None, "asset_class": asset_class, "reasoning": "no LLM key; stub"})
