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

## כל העלאה ל-TestFlight

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
