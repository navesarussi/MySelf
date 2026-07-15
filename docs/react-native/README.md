# המרה לאפליקציית React Native — תיעוד המהלך

> מסמך זה הוא נקודת הכניסה לכל מי שממשיך את המהלך. סטטוס חי ב-[STATUS.md](./STATUS.md).

## העיקרון המנחה

**האתר הקיים חייב להמשיך לעבוד בדיוק כמו שהוא.** האפליקציה נבנית *במקביל* לאתר,
לא במקומו. לכן:

- לא משנים שום התנהגות קיימת של האתר. כל שינוי בקוד האתר הוא **תוספת בלבד**
  (שכבת API חדשה, נתיב אימות נוסף).
- מסד הנתונים, המיגרציות, סנכרון היומן והאימות נשארים כפי שהם.
- האפליקציה יושבת בתיקייה נפרדת `mobile/` עם התלויות שלה, ולא נוגעת ב-build של האתר.

## ארכיטקטורה

```
┌────────────────────┐        ┌──────────────────────────────┐
│  mobile/ (Expo RN) │  HTTPS │  אתר Next.js (Vercel)        │
│  iOS / Android /   │───────▶│  ├─ דפי האתר (ללא שינוי)     │
│  Web               │ Bearer │  ├─ /api/v1/** (REST חדש)    │
└────────────────────┘        │  └─ Supabase (service role)   │
        │                     └──────────────────────────────┘
        └─ קוד משותף: lib/types, lib/i18n, lib/habit-stats,
           lib/timeline-display, lib/integrations/phone, ...
```

### החלטות מרכזיות

1. **API-first**: האפליקציה לא מדברת ישירות עם Supabase (מפתח ה-service-role
   לעולם לא נכנס לקליינט). במקום זה נוספה שכבת REST תחת `app/api/v1/` באתר,
   שממומשת עם אותן שאילתות Supabase ואותה לוגיקה (`lib/habit-stats`,
   `lib/projects/delete-guard`, `lib/integrations/phone`) כמו ה-server actions.
2. **אימות**: האתר משתמש בטוקן HMAC יחיד (`lib/auth.ts`) בעוגייה. ה-API מקבל את
   **אותו טוקן בדיוק** גם בכותרת `Authorization: Bearer <token>`. `proxy.ts`
   הורחב כך שנתיבי `/api/v1/**` מחזירים `401 JSON` (במקום redirect ל-login)
   ומכבדים Bearer — שינוי תוספתי שלא נוגע בהתנהגות הדפים.
3. **התחברות מהאפליקציה**: אותו OAuth של Google. האפליקציה פותחת את הדפדפן על
   `/api/auth/google/login?next=/api/v1/auth/mobile-redirect`, ואחרי ההתחברות
   הנתיב הזה מפנה חזרה לאפליקציה (`myself://auth?token=...`) עם הטוקן.
   האפליקציה שומרת אותו ב-SecureStore (בנייטיב) / localStorage (ב-web).
4. **קוד משותף אמיתי, לא העתקות**: ה-Metro של Expo מוגדר (watchFolders +
   tsconfig paths `@/*` → שורש הריפו) כך שהאפליקציה מייבאת ישירות את המודולים
   הטהורים: `lib/types`, `lib/i18n/{core,messages,types}`, `lib/habit-stats`,
   `lib/goals-rank`, `lib/timeline-display`, `lib/integrations/phone`,
   `lib/projects/delete-guard`, `components/ui/colors`. שינוי לוגיקה במקום אחד
   משפיע על שניהם. מודולים עם תלות בשרת (`next/headers`, Supabase) **אסורים**
   לייבוא מהאפליקציה.
5. **Expo + expo-router**: פלטפורמה אחת ל-iOS, Android ו-Web
   (react-native-web). ניווט טאבים תחתון שמשקף את ה-mobile-nav של האתר:
   בית · משימות · ➕ · הרגלים · קשרים, וכל השאר (ציר זמן, מטרות, ספרייה,
   הגדרות) מתוך מסך הבית ומסך "עוד".
6. **עברית/RTL תחילה**: אותם קבצי תרגום (`lib/i18n/messages.ts`), ברירת מחדל
   עברית, עיצוב לפי אותם design tokens (`components/ui/colors.ts` — palette
   dark/light).

## מבנה `mobile/`

```
mobile/
├─ app/                 # expo-router: מסכים
│  ├─ _layout.tsx       # ספקי theme/i18n/session + שער התחברות
│  ├─ login.tsx
│  ├─ (tabs)/           # בית, משימות, הרגלים, קשרים, עוד
│  ├─ timeline.tsx  goals.tsx  library.tsx  settings.tsx
├─ src/
│  ├─ api/client.ts     # fetch + Bearer, טיפול ב-401
│  ├─ api/resources.ts  # פונקציות טיפוסיות לכל משאב v1
│  ├─ session.tsx       # אחסון טוקן + כתובת שרת
│  ├─ i18n.tsx          # עטיפת RN לאותו createTranslator
│  ├─ theme.tsx         # palette משותף + light/dark
│  └─ components/       # Card, Chip, Button, שדות טופס...
├─ metro.config.js      # watchFolders לשורש הריפו (קוד משותף)
└─ app.json             # scheme: "myself" (deep-link לאימות)
```

## הרצה

```bash
# אתר (ללא שינוי)
npm install && npm run dev

# אפליקציה
cd mobile
npm install
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start
# i = iOS simulator, a = Android, w = דפדפן
```

בהתקנה אמיתית מגדירים `EXPO_PUBLIC_API_URL` לכתובת הפרודקשן (Vercel) בזמן build.

## REST API v1 — סיכום

כל הנתיבים דורשים `Authorization: Bearer <token>` (או עוגיית session).
תשובות שגיאה: `{ "error": "..." }` עם סטטוס מתאים; הצלחות מחזירות JSON של הרשומה/הרשימה.

| משאב | נתיבים |
| --- | --- |
| בדיקת טוקן | `GET /api/v1/session` |
| התחברות מובייל | `GET /api/v1/auth/mobile-redirect` (אחרי OAuth; מפנה ל-`myself://auth?token=…`) |
| מסך הבית | `GET /api/v1/home` (כל האגרגטים של הדשבורד) |
| פרויקטים | `GET/POST /api/v1/projects`, `PATCH/DELETE /api/v1/projects/:id` |
| משימות | `GET/POST /api/v1/tasks` (?project&status&priority), `PATCH/DELETE /api/v1/tasks/:id` |
| הרגלים | `GET/POST /api/v1/habits`, `PATCH/DELETE /api/v1/habits/:id`, `POST /api/v1/habits/:id/report` `{type: check_in\|fall\|reset}` |
| מטרות | `GET/POST /api/v1/goals`, `PATCH/DELETE /api/v1/goals/:id` (PATCH `{toggle_status:true}` להיפוך) |
| התחייבויות | `GET/POST /api/v1/commitments`, `PATCH/DELETE /api/v1/commitments/:id` |
| קשרים | `GET/POST /api/v1/relationships`, `PATCH/DELETE /api/v1/relationships/:id` (PATCH חלקי, כולל `last_contact_date`) |
| ספרייה | `GET/POST /api/v1/library` (?q&category), `PATCH/DELETE /api/v1/library/:id` |
| ציר זמן | `GET/POST /api/v1/timeline/events`, `PATCH/DELETE /api/v1/timeline/events/:id` (כללי google_calendar נשמרים), `GET/POST /api/v1/timeline/periods`, `PATCH/DELETE /api/v1/timeline/periods/:id` |
| סנכרון יומן | `GET /api/v1/sync/status`, `POST /api/v1/sync` |

כל מוטציה ב-API מריצה `revalidatePath` לאותם נתיבים כמו ה-server actions,
כך שהאתר מתעדכן מיד אחרי שינוי מהאפליקציה.

## מה הלאה

ראו [STATUS.md](./STATUS.md) — כולל רשימת פערים ידועים (ציר זמן ויזואלי עם זום,
התראות פוש, builds חנויות עם EAS).
