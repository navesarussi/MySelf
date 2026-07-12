/** Shared Tailwind class strings — keep action buttons and inputs consistent app-wide. */

export const inputClass =
  "w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";

export const actionButton = {
  /** Primary positive action — habit check-in, mark goal achieved, form submit */
  primary:
    "flex items-center justify-center gap-1 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-bg transition hover:opacity-90 disabled:opacity-50",
  primaryFull:
    "flex w-full items-center justify-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-bg transition hover:opacity-90 disabled:opacity-50",
  /** Secondary caution action — report fall, destructive-adjacent */
  warn: "flex items-center justify-center gap-1 rounded-md bg-warn/15 px-2 py-1 text-[11px] font-medium text-warn transition hover:bg-warn/25 disabled:opacity-50",
  warnFull:
    "flex w-full items-center justify-center gap-1 rounded-md bg-warn/15 px-2 py-1 text-[11px] font-medium text-warn transition hover:bg-warn/25 disabled:opacity-50",
  iconEdit: "rounded-md p-1 text-muted transition hover:text-accent",
  iconDelete: "rounded-md p-1 text-muted transition hover:text-warn",
  iconNeutral: "rounded-md p-1 text-muted transition hover:text-ink",
} as const;

export const submitButton =
  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-50";

export const badgeTone = {
  default: "bg-border/60 text-muted",
  accent: "bg-accent/15 text-accent",
  warn: "bg-warn/15 text-warn",
  good: "bg-good/15 text-good",
} as const;

export type BadgeTone = keyof typeof badgeTone;

function join(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function actionClass(
  variant: keyof typeof actionButton,
  extra?: string
): string {
  return join(actionButton[variant], extra);
}
