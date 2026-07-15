# העלאה ל-TestFlight (iOS) — מדריך צעד-אחר-צעד

התשתית כבר בריפו: `mobile/eas.json` (פרופילי build), אייקונים וספלאש ב-`mobile/assets/`,
‏`bundleIdentifier: com.navesarussi.myself`, וכתובת הפרודקשן (`https://myselfapp.xyz`)
מוזרקת אוטומטית ל-build הפרודקשן.

## חד-פעמי (מהמחשב שלך, עם חשבון ה-EAS הקיים)

```bash
cd mobile
npm install
npx eas-cli login                # חשבון ה-Expo/EAS הקיים
npx eas-cli init                 # מקשר את הפרויקט לחשבון (כותב projectId ל-app.json)
```

דרישות בצד אפל (פעם אחת):
1. חשבון Apple Developer פעיל (99$/שנה).
2. ב-App Store Connect: צור אפליקציה חדשה עם Bundle ID‏ `com.navesarussi.myself`
   (אם ה-Bundle ID עוד לא רשום — EAS ירשום אותו בשבילך בזמן ה-build הראשון).

## אוטומציה מלאה (GitHub Actions)

כל push ל-`main` שמשנה קבצים תחת `mobile/` מפעיל את
[`.github/workflows/testflight-ios.yml`](../../.github/workflows/testflight-ios.yml):

1. מעלה **patch** ב-`package.json` (שורש + mobile) וב-`mobile/app.json`
2. מריץ `eas build --platform ios --profile production --auto-submit`
3. מספר ה-build עולה אוטומטית ב-EAS (`autoIncrement`)

### חד-פעמי — GitHub Secrets

ב-GitHub: **Settings → Secrets and variables → Actions**

| Secret | ערך |
| --- | --- |
| `EXPO_TOKEN` | צור ב-[expo.dev → Access Tokens](https://expo.dev/accounts/saussilberg/settings/access-tokens) (Robot user מומלץ) |
| `ASC_API_KEY_P8` | תוכן קובץ `AuthKey_X3N8885G95.p8` |
| `ASC_API_KEY_ID` | `X3N8885G95` |
| `ASC_API_KEY_ISSUER_ID` | `3a825a1a-0b43-487a-9ba4-1ab24a88f553` |

`ASC_API_KEY_*` כבר הוגדרו בריפו. נשאר רק **`EXPO_TOKEN`**:

```bash
# אחרי יצירת הטוקן ב-expo.dev:
gh secret set EXPO_TOKEN --repo navesarussi/MySelf
```

אם branch protection חוסם push של bump-version, הוסף גם `ADMIN_PAT` (PAT עם `repo`).

### בדיקה ידנית

GitHub → **Actions** → **TestFlight iOS** → **Run workflow**.

### עדכונים בטלפון

בודקים פנימיים (קבוצת `tests`) מקבלים עדכון אוטומטית ב-TestFlight אחרי ש-Apple מסיימת לעבד את ה-build (בדרך כלל 5–15 דקות).

---

## העלאה ידנית (גיבוי)

```bash
cd mobile
npx eas-cli build --platform ios --profile production   # build בענן של Expo
npx eas-cli submit --platform ios --latest              # שליחה ל-TestFlight
```

- ‏EAS שואל פעם ראשונה על חשבון האפל ומנהל לבד certificates/profiles.
- מספר ה-build עולה אוטומטית (`autoIncrement` + ‏`appVersionSource: remote`).
- אחרי עיבוד קצר ב-App Store Connect, ההתקנה זמינה באפליקציית TestFlight.

## בדיקות מהירות בלי TestFlight (בינתיים)

| דרך | פקודה | הערות |
| --- | --- | --- |
| **Expo Go בטלפון** | `cd mobile && npx expo start` ואז סריקת ה-QR באפליקציית Expo Go | הכי מהיר. ה-deep-link של Google עובד דרך `exp://`, ואם לא — כניסה עם טוקן ידני |
| **דפדפן במחשב** | `cd mobile && npx expo start --web` | רץ מול `https://myselfapp.xyz` (CORS כבר פתוח ל-`/api/v1`) |
| **סימולטור iOS** | `npx eas-cli build -p ios --profile preview` | build לסימולטור, בלי חשבון אפל |

טוקן ידני לכניסה: היכנס לאתר בדפדפן ואז פתח
`https://myselfapp.xyz/api/v1/auth/mobile-redirect?format=json` — העתק את ה-token
והדבק במסך ההתחברות של האפליקציה.

## אנדרואיד (בהמשך, אותה תשתית)

```bash
npx eas-cli build --platform android --profile production
npx eas-cli submit --platform android --latest   # דורש חשבון Google Play + service key
```
