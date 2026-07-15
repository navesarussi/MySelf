import { ReactNode } from "react";
import { badgeTone, inputClass, submitButton } from "./theme";

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
        <h1 className="text-start text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-start text-sm text-muted">{subtitle}</p>}
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

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTone;
}) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeTone[tone]}`}>
      {children}
    </span>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button type="submit" className={submitButton}>
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

export { inputClass };
