export function DbWarning() {
  return (
    <div className="card border-warn/40 bg-warn/5 p-4 text-sm">
      <p className="font-medium text-warn">בסיס הנתונים עדיין לא מחובר</p>
      <p className="mt-1 text-muted">
        חסרים משתני הסביבה NEXT_PUBLIC_SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY. הוסף אותם
        בהגדרות הפרויקט ב-Vercel ואז פרוס מחדש.
      </p>
    </div>
  );
}
