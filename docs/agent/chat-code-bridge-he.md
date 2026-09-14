# גשר קוד: צ'אט → Cursor Cloud Agent

מאפשר להשיק סוכן קוד מ-WhatsApp או מצ'אט הסוכן באפליקציה, עם מיזוג אוטומטי ל-`main` אחרי CI ירוק.

## שימוש

שלח הודעה שמתחילה באחד מהקידומות:

- `קוד: <משימה>` — למשל: `קוד: תקן את מסך המשימות במובייל`
- `/dev <משימה>` — לא רגיש לרישיות; מפרידים אופציונליים אחרי `/dev`

הודעות רגילות (בלי קידומת) ממשיכות לסוכן Gemini הרגיל.

## מכסות (יום קלנדרי, Asia/Jerusalem)

| כלל | ערך |
|-----|-----|
| מקסימום השקות ביום | 3 |
| משימה בו-זמנית | 1 |
| המתנה בין השקות | 30 דקות |

אם נחסמת, תקבל הודעה בעברית עם הסיבה וכמה השקות נותרו היום.

## מה קורה אחרי השקה

1. נשלחת בקשה ל-Cursor Cloud Agents API (`autoCreatePR`, מ-`main`).
2. הסוכן פותח PR (בדרך כלל מסניף `cursor/...`).
3. Workflow `chat-code-automerge.yml` מריץ `npm run verify` על PR שמסומן `cursor/**` או עם תווית `chat-code`.
4. אחרי הצלחה — מיזוג squash ל-`main`.
5. **לא** מחכים ל-TestFlight / EAS iOS (מכסה חינמית מוגבלת).

## הגדרה בשרת

1. צור API Key ב-[Cursor Dashboard → API Keys](https://cursor.com/dashboard/api).
2. ב-Vercel Production הוסף `CURSOR_API_KEY`.
3. Redeploy.
4. בדיקה: `קוד: הוסף שורה ל-README` מ-WhatsApp מורשה.

## אבטחה

- WhatsApp: רק מספר מורשה (`agent_settings.whatsapp_phone`).
- אפליקציה: `isApiAuthorized`.
- מפתח API לא נרשם בלוגים.

## מסד נתונים

משימות נשמרות ב-`myself.coding_agent_jobs` (מיגרציה `0030_coding_agent_jobs.sql`).
