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

### Push Notifications (חד-פעמי — חובה לפני בדיקת פוש)

1. [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list) →
   `com.navesarussi.myself` → סמן **Push Notifications** → Save.
2. הגדר APNs key ב-EAS (פעם אחת):

```bash
cd mobile
npx eas-cli credentials
# iOS → production → Push Notifications → Create / upload APNs Auth Key (.p8)
```

3. אחרי הוספת `expo-notifications` נדרש **build חדש** ל-TestFlight (לא OTA) —
   entitlements משתנים. סימולטור ו-Expo Go לא מספיקים לבדיקת push אמיתי.

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

### HomeWidget extension — provisioning (multi-target)

Since the iPhone home widget was added, iOS builds have **two** Xcode targets:

| Target | Bundle ID |
| --- | --- |
| MeAndMySelf (main app) | `com.navesarussi.myself` |
| HomeWidget (widget extension) | `com.navesarussi.myself.homewidget` |

Each target needs its own App Store provisioning profile. The TestFlight workflow passes
`EXPO_ASC_*` env vars (via `mobile/scripts/ci-export-asc-env.sh`) so EAS can create or
repair the HomeWidget profile non-interactively using the App Store Connect API key.

If CI still fails with `Credentials are not set up` for `HomeWidget`, run this **once**
on a Mac with Xcode (interactive — not `--non-interactive`):

```bash
cd mobile
npm ci
# Write asc-api-key.p8 (symlink or copy AuthKey_X3N8885G95.p8)
export ASC_API_KEY_ID="X3N8885G95"
export ASC_API_KEY_ISSUER_ID="3a825a1a-0b43-487a-9ba4-1ab24a88f553"
source scripts/ci-export-asc-env.sh
npx eas-cli build --platform ios --profile production --local
# Accept prompts to create HomeWidget credentials; EAS stores them remotely.
```

After that one-time setup, GitHub Actions `--non-interactive` builds reuse the stored
HomeWidget profile. Verify with:

```bash
cd mobile && npx eas-cli credentials -p ios
# → select production → inspect HomeWidget (com.navesarussi.myself.homewidget)
```

### אם העלאה "מצליחה" אבל build לא מופיע ב-ASC

1. **Activity** ב-App Store Connect (לא רק TestFlight) — חפש `Invalid` / `Failed`.
2. שגיאה נפוצה (**90626**): תיאור App Intent לא יכול להכיל המילה `apple` (כולל "Apple Pay").
   הקובץ: `mobile/native-ios/LogApplePayExpenseIntent.swift` — השתמש ב"תשלום" / "Wallet", לא "Apple Pay".
3. סנכרון מונה EAS עם ASC (אם EAS קפץ ל-70+ בלי builds ב-ASC):

```bash
cd mobile
node scripts/sync-eas-ios-build-number.mjs
bash scripts/build-and-submit-testflight.sh
```

### עדכונים בטלפון

בודקים פנימיים (קבוצת `tests`) מקבלים עדכון אוטומטית ב-TestFlight אחרי ש-Apple מסיימת לעבד את ה-build (בדרך כלל 5–15 דקות).

---

## העלאה ידנית (גיבוי) — בילד לוקאלי (חינם, בלי מכסת EAS בענן)

```bash
cd mobile
bash scripts/build-and-submit-testflight.sh
```

או בשלבים:

```bash
cd mobile
npx eas-cli build --platform ios --profile production --local --output ./build-myself.ipa
npx eas-cli submit --platform ios --profile production --path ./build-myself.ipa --wait
```

דרישות: Xcode מותקן, `eas login`, ו-`mobile/asc-api-key.p8` (מפתח App Store Connect).

### בילד בענן (אם יש מכסה חודשית ב-EAS)

```bash
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
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
