# מרכז השליטה

דשבורד אישי פרטי: ציר זמן, הרגלים/משימות/מטרות/חלומות, ניהול קשרים, וספריית תוכן.

Next.js (App Router) + Tailwind + Supabase (Postgres). כניסה עם Google (כולל סנכרון יומן).

## הרצה מקומית

```bash
npm install
cp .env.example .env.local   # ולמלא את הערכים
npm run dev
```

## משתני סביבה

| שם | הסבר |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | כתובת ה-API של פרויקט Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | מפתח ה-service role (סודי, שרת בלבד) |
| `AUTH_SECRET` | מחרוזת אקראית וסודית לחתימת עוגיית ההתחברות (למשל: `openssl rand -hex 32`) |
| `ALLOWED_GOOGLE_EMAIL` | (מומלץ) רק חשבונות Google אלה יכולים להיכנס (אימייל בודד, או כמה מופרדים בפסיק). **החשבון הראשון ברשימה הוא הבעלים** — רק הכניסה שלו יוצרת/מחליפה את חיבור סנכרון היומן; חשבונות נוספים ברשימה מקבלים גישה מלאה לצפייה ועריכה באתר בלי לגעת בסנכרון היומן. אפשר גם להוסיף מיילים מורשים דרך הטבלה `myself.allowed_google_emails` בלי לגעת במשתנה הזה בכלל |
| `GOOGLE_CLIENT_ID` | OAuth client ID מ-Google Cloud |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Callback, למשל `http://localhost:3000/api/auth/google/callback` |
| `GOOGLE_TASKS_REDIRECT_URI` | Callback למשימות גוגל, בפרודקשן: `https://myselfapp.xyz/api/integrations/google-tasks/callback` |
| `CRON_SECRET` | מחרוזת סודית לאימות סנכרון שבועי (Vercel Cron) |

## Google Sign-In + יומן

1. ב-[Google Cloud Console](https://console.cloud.google.com/) הפעל את **Google Calendar API**.
2. צור **OAuth 2.0 Client ID** (Web application).
3. הוסף Redirect URI:
   - `https://<domain>/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback` (פיתוח)
4. ב-OAuth consent screen הוסף **Privacy policy URL**: `https://<domain>/privacy`
5. מלא את משתני הסביבה של גוגל + `AUTH_SECRET` + `ALLOWED_GOOGLE_EMAIL`.
6. בדף הכניסה לחץ **כניסה עם Google** — היומן מסתנכרן ברקע אחרי ההתחברות.

## פריסה ל-Vercel

1. חבר את הריפו הזה (`navesarussi/myself`) לפרויקט חדש ב-Vercel.
2. הגדר את משתני הסביבה ב-Project Settings → Environment Variables.
3. פרוס. כל push ל-`main` יעלה גרסה חדשה אוטומטית.

## בסיס הנתונים

הסכימה נמצאת ב-`supabase/migrations/`. ה-DB רץ תחת schema נפרד בשם `myself` באותו פרויקט
Supabase, כדי לא להתערבב עם נתונים של פרויקטים אחרים.

אחרי שינוי סכימה, הרץ מיגרציות על ה-DB המרוחק:

```bash
npm run db:apply
```

(דורש Supabase CLI מחובר לפרויקט: `supabase link --project-ref roeefqpdbftlndzsvhfj`)
