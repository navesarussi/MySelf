"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "@/components/locale-provider";

export function AddFormToggle({
  label,
  children,
  defaultOpen = false,
  className = "",
  id,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  id?: string;
}) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
      requestAnimationFrame(() => {
        rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [defaultOpen]);

  if (!open) {
    return (
      <div ref={rootRef} id={id} className={className}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border/70 px-4 py-3 text-sm text-muted transition hover:border-accent/40 hover:bg-accent/5 hover:text-ink"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Plus size={18} />
          </span>
          <span>{label}</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} id={id} className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted">{label}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-border/40 hover:text-ink"
        >
          <X size={14} />
          {t("common.close")}
        </button>
      </div>
      {children}
    </div>
  );
}
