"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "@/components/locale-provider";
import { AddMenuList } from "@/components/add-menu-list";

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
    <div
      ref={menuRef}
      className="fixed bottom-6 end-6 z-40 hidden flex-col items-end gap-2 sm:flex"
    >
      {open && <AddMenuList onSelect={() => setOpen(false)} className="mb-1 w-56" />}

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
