import { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="card border-dashed p-6 text-center text-sm text-muted">{text}</div>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "warn" | "good" }) {
  const tones: Record<string, string> = {
    default: "bg-border/60 text-muted",
    accent: "bg-accent/15 text-accent",
    warn: "bg-warn/15 text-warn",
    good: "bg-good/15 text-good",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:opacity-90"
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  title,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return (
    <button
      title={title}
      className={`rounded-lg p-2 text-muted transition hover:bg-border/50 hover:text-ink ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export const inputClass =
  "w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";
