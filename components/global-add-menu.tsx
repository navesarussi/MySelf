"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Calendar,
  CheckSquare,
  Flag,
  Layers,
  Plus,
  Repeat,
  Target,
  UserPlus,
  X,
} from "lucide-react";
import { useTranslations } from "@/components/locale-provider";
import { addTargetHref, type AddTarget } from "@/lib/add-menu";

const MENU_ITEMS: { target: AddTarget; icon: typeof Plus }[] = [
  { target: "task", icon: CheckSquare },
  { target: "contact", icon: UserPlus },
  { target: "event", icon: Calendar },
  { target: "period", icon: Layers },
  { target: "project", icon: Flag },
  { target: "habit", icon: Repeat },
  { target: "goal", icon: Target },
  { target: "commitment", icon: Target },
  { target: "entry", icon: BookOpen },
];

export function GlobalAddMenu() {
  const pathname = usePathname();
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (pathname === "/login") return null;

  return (
    <div ref={menuRef} className="fixed bottom-6 end-6 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="card mb-1 w-56 overflow-hidden p-1 shadow-lg">
          <p className="px-3 py-2 text-xs font-medium text-muted">{t("addMenu.title")}</p>
          {MENU_ITEMS.map(({ target, icon: Icon }) => (
            <Link
              key={target}
              href={addTargetHref(target)}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-border/40"
            >
              <Icon size={16} className="shrink-0 text-accent" />
              {t(`addMenu.${target}`)}
            </Link>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? t("common.close") : t("addMenu.title")}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-bg shadow-lg transition hover:opacity-90"
      >
        {open ? <X size={24} /> : <Plus size={24} />}
      </button>
    </div>
  );
}
