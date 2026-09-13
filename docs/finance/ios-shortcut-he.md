# קיצור iOS ל-Apple Pay → MySelf

מאפשר לקבל תנועות Apple Pay בזמן אמת, להצליב אותן מול כללי סוחרים (`merchant_rules`), לקבל התראת "למה ההוצאה?", ולהכין את הקרקע לאיחוד מול חיובים מרוכזים בלאומי.

## דרישות

1. אפליקציית **MySelf** מותקנת ב-iPhone
2. משתנה סביבה `FINANCE_INGEST_TOKEN` מוגדר ב-Vercel (אותו ערך שתשתמש בו בקיצור)
3. כתובת השרת: `https://myselfapp.xyz` (או הדומיין האישי שלך)

---

## הגדרת הטוקן

1. צור מחרוזת אקראית ארוכה וחזקה (Password Generator).
2. ב-Vercel → Project → Settings → Environment Variables:
   - `FINANCE_INGEST_TOKEN` = המחרוזת שיצרת.
3. בצע Redeploy כדי שהמשתנה ייכנס לתוקף.
4. שמור את אותה מחרוזת ב-**iCloud Keychain** או בתוך פעולת **Text** ייעודית בקיצור ב-iPhone (הגן על המכשיר).

---

## קיצור: "MySelf — Apple Pay"

### אוטומציה מומלצת (iOS 17 ו-iOS 18)

1. פתח את אפליקציית **Shortcuts** (קיצורים) ב-iPhone.
2. עבור ללשונית **Automation** (אוטומציות) ולחץ על **+** ליצירת אוטומציה אישית חדשה.
3. בחר בטריגר **Transaction** (עסקה ב-Apple Pay / כרטיס Wallet):
   - **Card:** בחר Any Card (כל הכרטיסים) או כרטיס ספציפי (למשל כרטיס MAX או Cal).
   - **Category:** Any.
   - סמן **Run Immediately** (הרץ מיד) ובטל את **Notify When Run** (אל תבקש אישור לפני ריצה).
4. לחץ על **Next** ובחר **New Blank Automation** (הוסף פעולות).

### פירוט הפעולות לבנייה באוטומציה

#### 1. קבלת פרטי העסקה מהטריגר
הטריגר של iOS מעביר משתנה בשם **Shortcut Input** (או פרטי העסקה).
ניתן להשתמש בפעולות:
- **Get Details of Transaction** לבחירת:
  - `Amount` (סכום)
  - `Merchant` (שם בית העסק)
  - `Card Name` (שם הכרטיס ב-Wallet)
  - `Date` (תאריך ושעה)

> **הערה לגבי מזהה ייחודי (`identifier`):**
> בגרסאות iOS 17/18, אם טריגר העסקה מספק מזהה עסקה, העבר אותו בשדה `identifier`.
> אם אין מזהה מובנה ישיר, מומלץ לחבר שילוב ייחודי: למשל `Formatted Date (yyyyMMddHHmmss)-Amount-CardName`. שדה זה מבטיח דה-דופליקציה מוחלטת ב-`external_key` (`apple_pay:CardName:identifier`).

#### 2. עיצוב תאריך ושעה
- הוסף פעולת **Format Date**:
  - בחר את תאריך העסקה מהטריגר.
  - Date Format: Custom → `yyyy-MM-dd`
  - שמור במשתנה `TxnDate`.
- (אופציונלי) הוסף פעולת **Format Date** לשעה:
  - Time Format: Custom → `HH:mm`
  - שמור במשתנה `TxnTime`.

#### 3. הרכבת גוף הבקשה (JSON)
הוסף פעולת **Text** עם התוכן הבא (גרור את המשתנים מהשלבים הקודמים למקומות המתאימים):

```json
{
  "source": "apple_pay",
  "txn_date": "2026-09-13",
  "txn_time": "14:30",
  "amount": 42.90,
  "merchant": "Super-Pharm",
  "description": "Super-Pharm",
  "card_name": "MAX",
  "identifier": "20260913143000-4290-MAX"
}
```

*הנחיות לשדות:*
- `source`: קבוע `"apple_pay"`.
- `card_name`: למשל `"MAX"`, `"Cal"`, `"Isracard"` או שם הכרטיס כפי שמופיע ב-Wallet.
- `identifier`: מזהה ייחודי של העסקה למניעת כפילויות.
- `amount`: ערך מספרי חיובי.

#### 4. שליחת הבקשה ל-API
הוסף פעולת **Get Contents of URL**:
- **URL:** `https://myselfapp.xyz/api/v1/finance/ingest`
- **Method:** `POST`
- **Headers:**
  - `Authorization`: `Bearer YOUR_FINANCE_INGEST_TOKEN`
  - `Content-Type`: `application/json`
- **Request Body:** בחר `File` או `Text` וחבר את פלט פעולת ה-Text מהשלב הקודם.

---

## איך זה עובד עם כללי סוחרים ואיחוד (Reconciliation)?

1. **החלת כללים אוטומטית (Merchant Rules):**
   ברגע שהתנועה נקלטת מה-Apple Pay, שרת MySelf בודק האם קיים כלל שמור עבור בית העסק (`merchant_rules`):
   - אם קיים כלל: התנועה מסווגת מיידית (למשל קטגוריה "סופר", סוג "משתנה", והערה קבועה).
   - אם אין עדיין כלל: נשלחת אליך התראת Push עם קישור לסיווג מהיר (`/finance-categorize?id=...`). בסיווג תוכל לסמן "זכור לעתיד" כדי שכל העסקאות הבאות מסוחר זה יסווגו לבד.

2. **איחוד מול חיובי הבנק (Reconciliation):**
   - כרטיסי MAX / Cal ו-Apple Pay מביאים את פירוט העסקה המדויק (למשל "שופרסל דיל ₪320.00").
   - בבנק לאומי מופיע בסוף החודש חיוב מרוכז אחד (למשל "מקס איט סך ₪4,200").
   - מנוע האיחוד מסמן את החיוב המרוכז בבנק כ-`is_internal = true` ומחריג אותו מחישובי ההוצאות ותזרים המזומנים, כך שהפירוט המדויק מכרטיס האשראי ו-Apple Pay הוא זה שנכנס לתקציב ללא ספירה כפולה!

---

## בדיקה מהירה באמצעות cURL

```bash
curl -X POST "https://myselfapp.xyz/api/v1/finance/ingest" \
  -H "Authorization: Bearer YOUR_FINANCE_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "apple_pay",
    "txn_date": "2026-09-13",
    "txn_time": "12:15",
    "amount": 25.00,
    "merchant": "קפה שכונתי",
    "description": "קפה שכונתי",
    "card_name": "Cal",
    "identifier": "test-apple-pay-001"
  }'
```
תגובה צפויה:
```json
{"created":[{"id":"...","source":"apple_pay","amount":25,...}],"skipped":0}
```
שליחה חוזרת של אותו JSON בדיוק תחזיר `{"created":[],"skipped":1}` תודות ל-`external_key` הייחודי.
