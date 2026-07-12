# מרכז השליטה

דשבורד אישי פרטי: ציר זמן, הרגלים/משימות/מטרות/חלומות, ניהול קשרים, וספריית תוכן.

Next.js (App Router) + Tailwind + Supabase (Postgres). כל האתר מוגן בסיסמה אחת.

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
| `SITE_PASSWORD` | הסיסמה לכניסה לאתר |
| `AUTH_SECRET` | מחרוזת אקראית וסודית לחתימת עוגיית ההתחברות (למשל: `openssl rand -hex 32`) |
| `GOOGLE_CLIENT_ID` | OAuth client ID מ-Google Cloud (יומן גוגל) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Callback, למשל `http://localhost:3000/api/integrations/google/callback` |
| `CRON_SECRET` | מחרוזת סודית לאימות סנכרון שבועי (Vercel Cron) |

## יומן גוגל (אופציונלי)

1. ב-[Google Cloud Console](https://console.cloud.google.com/) הפעל את **Google Calendar API**.
2. צור **OAuth 2.0 Client ID** (Web application).
3. הוסף Redirect URI: `https://<domain>/api/integrations/google/callback` (וגם localhost לפיתוח).
4. מלא את משתני הסביבה של גוגל.
5. ב-**הגדרות** באתר לחץ **חיבור יומן גוגל**.

## פריסה ל-Vercel

1. חבר את הריפו הזה (`navesarussi/myself`) לפרויקט חדש ב-Vercel.
2. הגדר את משתני הסביבה ב-Project Settings → Environment Variables.
3. פרוס. כל push ל-`main` יעלה גרסה חדשה אוטומטית.

## בסיס הנתונים

הסכימה נמצאת ב-`supabase/migrations/`. ה-DB רץ תחת schema נפרד בשם `myself` באותו פרויקט
Supabase, כדי לא להתערבב עם נתונים של פרויקטים אחרים.
