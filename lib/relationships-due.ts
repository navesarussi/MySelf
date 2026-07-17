import { differenceInCalendarDays } from "date-fns";

export type DueFields = {
  last_contact_date: string | null;
  reminder_days: number | null;
};

export function isRelationshipDue(r: DueFields, today: Date): boolean {
  if (r.reminder_days == null) return false;
  const days = r.last_contact_date
    ? differenceInCalendarDays(today, new Date(r.last_contact_date))
    : Infinity;
  return days >= r.reminder_days;
}

export function filterDueRelationships<T extends DueFields & { name: string }>(
  rows: T[],
  today: Date
): T[] {
  return rows
    .filter((r) => isRelationshipDue(r, today))
    .sort((a, b) => {
      const daysA = a.last_contact_date
        ? differenceInCalendarDays(today, new Date(a.last_contact_date))
        : -Infinity;
      const daysB = b.last_contact_date
        ? differenceInCalendarDays(today, new Date(b.last_contact_date))
        : -Infinity;
      if (daysA !== daysB) return daysB - daysA;
      return a.name.localeCompare(b.name, "he");
    });
}
