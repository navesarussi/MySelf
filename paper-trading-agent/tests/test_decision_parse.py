import pytest
from trading_agent.decision.parse import DecisionParseError, parse_decision

VALID = '{"action":"buy","symbol":"AAPL","size":1,"stop_loss":null,"take_profit":210,"asset_class":"stock","reasoning":"test"}'

def test_parses_exact_valid_json():
    assert parse_decision(VALID).symbol == "AAPL"

@pytest.mark.parametrize("raw", [
    '{"action":"hold","symbol":"AAPL","size":0,"stop_loss":null,"take_profit":null,"asset_class":"stock"}',
    '{"action":"hold","symbol":"AAPL","size":0,"stop_loss":null,"take_profit":null,"asset_class":"stock","reasoning":"x","extra":1}',
    '```json\n' + VALID + '\n```',
])
def test_rejects_schema_drift_and_markdown(raw):
    with pytest.raises(DecisionParseError):
        parse_decision(raw)
