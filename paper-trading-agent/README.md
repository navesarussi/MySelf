# סוכן מסחר נייר בסיוע AI

זהו שלד קטן ושקוף למחזור החלטה יחיד עבור מניות אמריקאיות וקריפטו דרך **Alpaca Paper**. הוא מביא נתוני שוק, מבקש החלטת JSON מספק LLM, בודק אותה בקוד Python דטרמיניסטי, ומתעד כל החלטה בקובץ JSONL.

## מה זה — ומה זה לא

- זהו כלי **paper-only** עם אדם בתהליך. הוא מסרב לכתובת Alpaca חיה או ל־`PAPER=false`.
- זה **אינו** בוט מסחר חי ואוטונומי. החלטת ה־LLM אינה פקודה: `RiskManager` נמצא מחוץ ל־LLM וחייב לאשר אותה לפני ביצוע.
- פקודות מעל סף כספי דורשות `APPROVE=1`, גם במסחר נייר. מתועדות גם החלטות שנדחו.
- אין כאן cron/לולאה אוטונומית, backtester, או אינטגרציות eToro/IBKR/Kraken.

## התחלה מהירה

1. צרו חשבון Paper ב־[Alpaca](https://alpaca.markets/), והנפיקו Paper API keys מתוך לוח הבקרה שלהם. אין להשתמש במפתחות מסחר חי.
2. העתיקו את ההגדרות ומלאו רק את מה שנחוץ:
   ```bash
   cd paper-trading-agent
   cp .env.example .env
   ```
   `ALLOWED_SYMBOLS` מאפשר להחליף את רשימת ברירת המחדל: `AAPL,MSFT,NVDA,SPY,BTC/USD,ETH/USD`.
3. התקינו והריצו בדיקה ללא רשת או מפתחות:
   ```bash
   python3.11 -m venv .venv
   . .venv/bin/activate
   pip install -e '.[test]'
   python -m trading_agent run --symbol AAPL --dry-run
   pytest
   ```
   בהיעדר מפתחות Alpaca, dry-run משתמש אוטומטית ב־`MockBroker` ומודיע על כך ב־stderr. בהיעדר מפתח LLM, מוחזרת החלטת `hold` בטוחה עם הסיבה `no LLM key; stub`.

## הפעלה עם Alpaca Paper

הגדירו `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, והשאירו `PAPER=true` ו־`ALPACA_BASE_URL=https://paper-api.alpaca.markets`. לאחר מכן אפשר להריץ מחזור יחיד:

```bash
python -m trading_agent run --symbol BTC/USD --dry-run
# ללא --dry-run נדרשים מפתחות Alpaca Paper, ורק החלטה שעברה סיכון תישלח.
python -m trading_agent run --symbol AAPL
```

אפשר להגדיר `OPENAI_API_KEY` או `ANTHROPIC_API_KEY`. שני הלקוחות משתמשים ב־HTTP סטנדרטי בלבד ודורשים מהמודל JSON קשיח ללא Markdown; כל פלט לא תקין נדחה ומתועד.

## בקרות בטיחות

הגדרות `.env` כוללות `MAX_POSITION_PCT` (5%), `MAX_DAILY_LOSS_PCT` (3%), `HUMAN_APPROVAL_THRESHOLD_USD`, ו־`ALLOWED_SYMBOLS`. המינוף מוגבל ל־1, `buy`/`sell` בגודל אפס נדחים, ו־`close` דורש פוזיציה קיימת. האירועים נשמרים append-only ב־`logs/decisions.jsonl` עם ההחלטה הגולמית, תוצאת הסיכון ומצב הביצוע.

## צעדים הבאים

השלב הבא הוא להריץ מחזורי paper אמיתיים, להחליף או להוסיף מתאם broker בהתאם ל־`BrokerClient`, ובהמשך לחבר webhooks של TradingView. אין לממש או להפעיל מסחר חי לפני בדיקה, ניטור ואישור אנושי מתאימים.

---

## English (short)

A paper-only, human-in-the-loop AI-assisted trading scaffold for Alpaca stocks and crypto. LLM output is strict JSON and is **never** executed before deterministic `RiskManager` checks. Use `python -m trading_agent run --symbol AAPL --dry-run` for an offline cycle; without Alpaca keys, dry-run uses `MockBroker`, while non-dry-run exits clearly. Logs are append-only JSONL in `logs/decisions.jsonl`. Live trading is deliberately refused in v1.
