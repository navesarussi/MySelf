import type { Task, TaskSource } from "@/lib/types";

export type TaskFieldKey =
  | "title"
  | "notes"
  | "dueDate"
  | "priority"
  | "status"
  | "delete"
  | "hideLocally"
  | "moveList"
  | "copyToManual";

export type TaskFieldCapability = {
  editable: boolean;
  reasonHe?: string;
};

export type TaskCapabilities = Record<TaskFieldKey, TaskFieldCapability>;

const manualCaps: TaskCapabilities = {
  title: { editable: true },
  notes: { editable: true },
  dueDate: { editable: true },
  priority: { editable: true },
  status: { editable: true },
  delete: { editable: true },
  hideLocally: { editable: false, reasonHe: "משימות אישיות נמחקות לצמיתות" },
  moveList: { editable: false, reasonHe: "לא רלוונטי למשימות אישיות" },
  copyToManual: { editable: false, reasonHe: "כבר משימה אישית" },
};

const mondayCaps: TaskCapabilities = {
  title: { editable: false, reasonHe: "כותרת נשלטת ב-Monday — ערוך שם" },
  notes: { editable: false, reasonHe: "תיאור נשלט ב-Monday" },
  dueDate: { editable: false, reasonHe: "תאריך יעד נשלט ב-Monday" },
  priority: { editable: true },
  status: { editable: true },
  delete: { editable: true },
  hideLocally: { editable: true },
  moveList: { editable: false, reasonHe: "Monday לא תומך בהעברה בין לוחות מהאפליקציה" },
  copyToManual: { editable: true },
};

const googleCaps: TaskCapabilities = {
  title: { editable: true },
  notes: { editable: true },
  dueDate: { editable: true },
  priority: { editable: true },
  status: { editable: true },
  delete: { editable: true },
  hideLocally: { editable: true },
  moveList: { editable: true },
  copyToManual: { editable: true },
};

const githubCaps: TaskCapabilities = {
  title: { editable: true },
  notes: { editable: true },
  dueDate: { editable: false, reasonHe: "GitHub issues אין תאריך יעד" },
  priority: { editable: true },
  status: { editable: true },
  delete: { editable: true },
  hideLocally: { editable: true },
  moveList: { editable: false, reasonHe: "GitHub issues לא ניתנים להעברה בין repos" },
  copyToManual: { editable: true },
};

const gmailCaps: TaskCapabilities = {
  title: { editable: false, reasonHe: "משימות Gmail נשלטות ב-Gmail" },
  notes: { editable: false, reasonHe: "משימות Gmail נשלטות ב-Gmail" },
  dueDate: { editable: false, reasonHe: "משימות Gmail נשלטות ב-Gmail" },
  priority: { editable: true },
  status: { editable: true },
  delete: { editable: false, reasonHe: "מחיקה דרך Gmail בלבד" },
  hideLocally: { editable: true },
  moveList: { editable: false, reasonHe: "לא רלוונטי" },
  copyToManual: { editable: true },
};

const BY_SOURCE: Record<TaskSource, TaskCapabilities> = {
  manual: manualCaps,
  monday: mondayCaps,
  google_tasks: googleCaps,
  github: githubCaps,
  gmail: gmailCaps,
};

export function getTaskCapabilities(task: Pick<Task, "source">): TaskCapabilities {
  return BY_SOURCE[task.source] ?? manualCaps;
}

export type StatusOption = {
  value: string;
  label: string;
  isDone?: boolean;
};

/** Status choices shown in the edit sheet — source-specific where applicable. */
export function getTaskStatusOptions(task: Task): StatusOption[] {
  if (task.source === "github") {
    return [
      { value: "open", label: "פתוח" },
      { value: "done", label: "סגור" },
    ];
  }
  if (task.source === "google_tasks") {
    return [
      { value: "open", label: "פתוח" },
      { value: "done", label: "הושלם" },
    ];
  }
  if (task.source === "monday" && task.external_meta?.statusLabels?.length) {
    const openLabels = task.external_meta.statusLabels.filter((l) => !l.is_done);
    const doneLabels = task.external_meta.statusLabels.filter((l) => l.is_done);
    const options: StatusOption[] = openLabels.map((l) => ({
      value: `monday:${l.index}`,
      label: l.label,
    }));
    for (const l of doneLabels) {
      options.push({ value: "done", label: l.label, isDone: true });
    }
    if (!options.some((o) => o.isDone)) {
      options.push({ value: "done", label: "בוצע", isDone: true });
    }
    return options;
  }
  return [
    { value: "open", label: "פתוח" },
    { value: "in_progress", label: "בתהליך" },
    { value: "stuck", label: "תקוע" },
    { value: "review", label: "בבדיקה" },
    { value: "done", label: "בוצע" },
  ];
}
