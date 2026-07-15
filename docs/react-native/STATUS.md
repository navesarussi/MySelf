# סטטוס המרה ל-React Native — מסמך חי

עדכון אחרון: 2026-07-15 (איטרציה שלישית — פריטי ➕, toast, מסך בית מלא)

## שכבת API באתר (`app/api/v1/`)

- [x] `proxy.ts`: תמיכת Bearer + ‏401 JSON לנתיבי `/api/v1/**` (תוספת בלבד)
- [x] עזר אימות משותף `lib/api/auth.ts`
- [x] `GET /api/v1/session`
- [x] `GET /api/v1/auth/mobile-redirect` (deep-link `myself://auth?token=…`)
- [x] `GET /api/v1/home`
- [x] פרויקטים (רשימה/יצירה/שינוי שם/מחיקה עם delete-guard)
- [x] משימות (סינון project/status/priority, CRUD, עדכון סטטוס)
- [x] הרגלים (CRUD + check-in / fall / reset עם `computeCheckIn`/`computeFall`)
- [x] מטרות (CRUD + היפוך סטטוס)
- [x] התחייבויות (CRUD + סטטוס)
- [x] קשרים (CRUD חלקי, נרמול טלפון, `last_contact_date`)
- [x] ספרייה (חיפוש/קטגוריה, CRUD)
- [x] ציר זמן: אירועים (כולל כללי override/הסתרה לאירועי Google) + תקופות
- [x] סנכרון יומן: סטטוס + הפעלה ידנית

## אפליקציית `mobile/` (Expo)

- [x] שלד: Expo SDK 54, expo-router, TypeScript, metro משותף עם שורש הריפו
- [x] קוד משותף מהאתר: types, i18n, habit-stats, goals-rank, timeline-display, phone, delete-guard, palette
- [x] Session: שמירת טוקן ב-SecureStore (native) / localStorage (web), כתובת שרת ניתנת להגדרה
- [x] מסך התחברות: Google OAuth דרך הדפדפן + הדבקת טוקן ידנית (fallback)
- [x] Theme: אותם צבעים כמו האתר (dark/light לפי המערכת), RTL
- [x] טאבים תחתונים כמו באתר: בית · משימות · ➕ · הרגלים · קשרים · עוד
- [x] תפריט ➕ מרכזי (מקביל ל-`AddMenuList` באתר) — כל סוגי ההוספה עם `lib/add-menu`
- [x] Toast בעברית אחרי CRUD (FR-TOAST-01) — `mobile/src/toast.tsx` + `useMutate` עם מפתחות `flash.*`
- [x] מסך בית: מקביל ל-`HomeDashboard` — סטטיסטיקות לחיצות, כל ההרגלים, מטרות מדורגות,
      התחייבויות, משימות, כל הקשרים (ממוינים), אירועים אחרונים, ספריית תוכן
- [x] משימות: צ'יפים לסינון (פרויקט/סטטוס/עדיפות), הוספה/עריכה/מחיקה, קידום סטטוס
- [x] הרגלים: כרטיסים עם סטטיסטיקות, check-in/נפילה/איפוס, הוספה/עריכה/מחיקה
- [x] מטרות + התחייבויות: רשימות, הוספה/עריכה/סימון/מחיקה
- [x] קשרים: קבוצות, באיחור, "דיברנו היום", קישור WhatsApp, CRUD
- [x] ציר זמן: רשימה כרונולוגית (אירועים + תקופות), CRUD, שורת סנכרון יומן
- [x] ספרייה: חיפוש + קטגוריות, CRUD
- [x] הגדרות: החלפת שפה (עברית/English), סטטוס סנכרון יומן, כפתור חיבור Google Calendar,
      כתובת שרת, התנתקות
- [x] פרמטרי `?add=` מיושרים עם האתר (`task`, `contact`, `habit`, `goal`, `commitment`, `entry`, `event`, `period`)

## אימותים שבוצעו

- [x] `npm test` של האתר עובר ללא שינוי (50/50)
- [x] `next build` של האתר עובר (כל 22 נתיבי `/api/v1` נרשמו)
- [x] `tsc --noEmit` באפליקציה עובר נקי
- [x] `npx expo export --platform web` עובר — Metro מצליח לארוז כולל הייבוא
      המשותף משורש הריפו
- [ ] הרצה מול שרת אמיתי + מכשיר (דורש סביבה עם env אמיתי — ראו "פערים")

## פערים ידועים / המשך עבודה

- [x] **ציר זמן ויזואלי עם זום** — ‏`mobile/src/components/timeline-visual.tsx`:
      viewport וירטואלי (בלי canvas ענק), גרירה לפאן, צביטה + כפתורים לזום,
      תקופות ב-lanes, נקודות אירועים על ציר עם תוויות, קו "היום", כיבוד
      `min_zoom`, אותם חישובים משותפים (`timeline-layout`, `timeline-zoom`).
      מיתוג תצוגה ויזואלי/כרונולוגי במסך ציר הזמן.
- [x] תשתית TestFlight/EAS — ‏`mobile/eas.json`, אייקונים+ספלאש שנוצרו מהלוגו
      הקיים (`mobile/assets/`), ‏bundle id‏ `com.navesarussi.myself`, כתובת
      פרודקשן מוזרקת ל-build. מדריך מלא: [TESTFLIGHT.md](./TESTFLIGHT.md).
- [x] כתובת פרודקשן `https://myselfapp.xyz` כברירת מחדל + CORS פתוח ל-`/api/v1`
      (Bearer בלבד — העוגייה לא נשלחת cross-origin) כדי שגם ה-web build של
      האפליקציה יעבוד מכל origin.
- [ ] מסך פרויקטים ייעודי — מוסתר גם באתר (`SHOW_PROJECTS=false`); בחירת פרויקט
      קיימת בטפסים של משימות/קשרים. כשיופעל באתר, להוסיף טאב באפליקציה.
- [ ] התראות פוש.
- [ ] בדיקת deep-link `myself://` על מכשיר אמיתי (עובד ב-Expo Go דרך `exp://`).
- [ ] ‏`eas init` + ‏build ראשון — דורש התחברות לחשבון ה-EAS מהמחשב של הבעלים
      (ראו TESTFLIGHT.md); הצד של הריפו מוכן.
- [x] i18n: המסכים משתמשים באותם מפתחות מ-`lib/i18n/messages.ts`; מפתחות
      ייעודיים לאפליקציה נוספו שם תחת `mobile.*` (he+en) — מילון אחד לשניהם.

## איך ממשיכים איטרציה

1. לקרוא README.md כאן.
2. לעבוד על סעיף מ"פערים ידועים", לסמן, ולעדכן את "עדכון אחרון".
3. לשמור על החוק: שום שינוי התנהגות באתר.
