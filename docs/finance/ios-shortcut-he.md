# קיצור iOS ל-Apple Pay → MySelf

מאפשר לקבל התראה מיידית אחרי תשלום Apple Pay, לשאול "למה ההוצאה?", ולשמור בזרימת המזומנים.

## דרישות

1. אפליקציית **MySelf** מותקנת ב-iPhone
2. משתנה סביבה `FINANCE_INGEST_TOKEN` מוגדר ב-Vercel (אותו ערך שתשתמש בו בקיצור)
3. כתובת השרת: `https://myselfapp.xyz` (או הדומיין שלך)

## הגדרת הטוקן

1. צור מחרוזת אקראית ארוכה (למשל מ-password generator)
2. ב-Vercel → Project → Settings → Environment Variables:
   - `FINANCE_INGEST_TOKEN` = המחרוזת
3. Redeploy
4. שמור את אותה מחרוזת ב-**iCloud Keychain** או ב-**משתנה בקיצור** (לא לשתף)

## קיצור: "MySelf — Apple Pay"

### אוטומציה (מומלץ, iOS 17+)

1. **Shortcuts** → **Automation** → **+**
2. **Transaction** (או **Wallet** / התראת תשלום — לפי גרסת iOS)
3. כשמתבצע תשלום → **Run Immediately**
4. הוסף פעולות:

#### 1. קבל פרטי העסקה

- אם האוטומציה מעבירה משתנים (סכום, שם בית עסק) — השתמש בהם
- אחרת: **Get Details of Transaction** / טקסט מההתראה

#### 2. בנה JSON

**Text** action עם תוכן (התאם שמות משתנים):

```json
{
  "source": "apple_pay",
  "txn_date": "YYYY-MM-DD",
  "amount": 0.00,
  "merchant": "שם העסק",
  "description": "שם העסק",
  "card_name": "MAX"
}
```

- `txn_date`: **Format Date** → `yyyy-MM-dd`
- `amount`: מספר חיובי (ללא סימן מינוס)
- `card_name`: אופציונלי (MAX / Cal / וכו')

#### 3. שלח ל-API

**Get Contents of URL**:

| שדה | ערך |
|-----|-----|
| URL | `https://myselfapp.xyz/api/v1/finance/ingest` |
| Method | POST |
| Headers | `Authorization: Bearer YOUR_TOKEN` |
| Request Body | JSON מהשלב הקודם |

#### 4. (אופציונלי) פתח מסך קטגוריזציה

אם השרת החזיר `created[0].id`, אפשר **Open URL**:

`myself://finance-categorize?id=UUID`

(או לחכות להתראת Push מהשרת)

### אוטומציה מהתראות (iOS חדש)

אם יש **When I receive a notification from Wallet**:

1. Automation על התראת Wallet / Apple Pay
2. חלץ סכום ושם עסק מהטקסט (Regex)
3. אותו POST ל-`/api/v1/finance/ingest`

## מה קורה אחרי השליחה?

1. השרת שומר את התנועה ב-`finance_transactions`
2. נשלחת **התראת Push**: "תנועה חדשה — למה ההוצאה?"
3. לחיצה פותחת **מסך קטגוריזציה** באפליקציה
4. סנכרון לאומי (GitHub Actions כל ~15 דקות) ממזג עסקאות מהבנק ומדלג על כפילויות

## בדיקה ידנית

```bash
curl -X POST "https://myselfapp.xyz/api/v1/finance/ingest" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "apple_pay",
    "txn_date": "2026-09-13",
    "amount": 12.50,
    "merchant": "בדיקה",
    "description": "בדיקה"
  }'
```

## סנכרון לאומי (רקע)

GitHub Actions מריץ `yarn sync:leumi` עם **Repository secrets** (לא Vercel):

```bash
gh secret set LEUMI_USERNAME --body "YOUR_USER"
gh secret set LEUMI_PASSWORD --body "YOUR_PASSWORD"
```

כבר מוגדרים: `MYSELF_API_URL`, `FINANCE_INGEST_TOKEN`

סיסמת לאומי **לא** נשמרת ב-Vercel — רק ב-GitHub Secrets.
