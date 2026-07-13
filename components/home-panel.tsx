import Link from "next/link";
import type { ReactNode } from "react";

type HomePanelProps = {
  title: string;
  icon: ReactNode;
  href: string;
  linkLabel: string;
  children: ReactNode;
  maxHeight?: string;
};

export function HomePanel({
  title,
  icon,
  href,
  linkLabel,
  children,
  maxHeight = "max-h-80",
}: HomePanelProps) {
  return (
    <div className="card flex min-w-0 flex-col p-3">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <Link href={href} className="flex items-center gap-2 font-semibold transition hover:text-accent">
          <h3 className="flex items-center gap-2">{icon} {title}</h3>
        </Link>
        <Link href={href} className="shrink-0 text-xs text-accent hover:underline">
          {linkLabel}
        </Link>
      </div>
      <div className={`scrollbar-thin ${maxHeight} min-w-0 overflow-y-auto`}>{children}</div>
    </div>
  );
}
