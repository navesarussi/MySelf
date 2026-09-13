# קיצור iOS ל-Apple Pay → MySelf

מאפשר לקבל תנועות Apple Pay בזמן אמת, להצליב אותן מול כללי סוחרים (`merchant_rules`), לקבל התראת "למה ההוצאה?", ולהכין את הקרקע לאיחוד מול חיובים מרוכזים בלאומי.

## דרישות

1. אפליקציית **MeAndMySelf** מותקנת ב-iPhone (בילד native חדש עם App Intent)
2. משתנה סביבה `FINANCE_INGEST_TOKEN` מוגדר ב-Vercel **או** התחברות לאפליקציה (טוקן סשן)
3. כתובת השרת: `https://myselfapp.xyz`

---

## הגדרת הטוקן

### אפשרות א׳ — התחברות באפליקציה (מומלץ)

1. התחבר ל-MySelf באפליקציה.
2. האפליקציה שומרת את טוקן הסשן ב-Keychain — פעולת הקיצור משתמשת בו ברקע.

### אפשרות ב׳ — טוקן ingest ייעודי

1. צור מחרוזת אקראית ארוכה וחזקה (Password Generator).
2. ב-Vercel → Project → Settings → Environment Variables:
   - `FINANCE_INGEST_TOKEN` = המחרוזת שיצרת.
3. בצע Redeploy כדי שהמשתנה ייכנס לתוקף.
4. באפליקציה → **הגדרות** → **חיבורי כספים וכרטיסים** → הדבק את הטוקן תחת **טוקן Apple Pay (קיצורים)**.

---

## אוטומציה מומלצת (App Intent — iOS 16+)

האפליקציה מפרסמת פעולה מובנית: **«רשום הוצאה ל־MySelf»**.  
אוטומציית Transaction מעבירה פרטי העסקה ישירות לפעולה — **בלי** Get Details / Ask for Input.

### שלבים

1. פתח **Shortcuts** (קיצורים) → **Automation** (אוטומציות) → **+**.
2. בחר טריגר **Transaction** (עסקה ב-Apple Pay / כרטיס Wallet):
   - **Card:** Any Card או כרטיס ספציפי.
   - **Category:** Any.
   - סמן **Run Immediately** ובטל **Notify When Run**.
3. **Next** → **New Blank Automation**.
4. הוסף פעולה **רשום הוצאה ל־MySelf** (תחת MeAndMySelf).
5. חבר משתני הטריגר לפרמטרים:
   - `Amount` → **סכום**
   - `Merchant` → **בית עסק**
   - `Card Name` → **שם כרטיס**
   - `Date` → **תאריך**
   - `Transaction ID` → **מזהה עסקה** (אם זמין)
6. שמור.

> **הערה:** הפעולה מופיעה רק אחרי התקנת בילד native חדש (לא OTA). בנה מקומית: `cd mobile && npx expo prebuild --platform ios` ואז Xcode / `eas build --local`.

### מה קורה ברקע

הפעולה שולחת `POST https://myselfapp.xyz/api/v1/finance/ingest` עם:

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

- **Auth:** `Bearer` מ-Keychain (`FINANCE_INGEST_TOKEN` או טוקן סשן).
- **identifier:** מזהה מהטריגר, או שילוב `תאריך-סכום-כרטיס` לדה-דופליקציה.

---

## אוטומציה ידנית (ללא App Intent)

אם עדיין אין בילד עם Intent, אפשר לבנות קיצור ידני עם **Get Contents of URL** (ראה גרסה קודמת ב-git).  
בישראל, **Get Details of Transaction** של Apple לעיתים לא מחזיר Amount/Merchant — לכן מומלץ App Intent.

---

## איך זה עובד עם כללי סוחרים ואיחוד (Reconciliation)?

1. **החלת כללים אוטומטית (Merchant Rules):**
   ברגע שהתנועה נקלטת מה-Apple Pay, שרת MySelf בודק האם קיים כלל שמור עבור בית העסק (`merchant_rules`):
   - אם קיים כלל: התנועה מסווגת מיידית.
   - אם אין: נשלחת התראת Push עם קישור לסיווג מהיר.

2. **איחוד מול חיובי הבנק:**
   פירוט מ-Apple Pay / MAX / Cal נשמר; חיוב מרוכז בלאומי מסומן `is_internal` ולא נספר פעמיים.

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

תגובה צפויה: `{"created":[...],"skipped":0}`  
שליחה חוזרת: `{"created":[],"skipped":1}`

---

## מה זה לא

- לא FinanceKit (US/UK בלבד)
- לא תיקון ל-Get Details הגנרי של Apple בישראל
- לא שינוי ב-legacy Next.js UI
