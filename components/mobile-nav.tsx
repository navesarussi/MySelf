"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckSquare, Home, Plus, Repeat, Users, X } from "lucide-react";
import { useTranslations } from "@/components/locale-provider";
import { AddMenuList } from "@/components/add-menu-list";

/** Phone-only bottom navigation: Home · Tasks · ➕ · Habits · Relationships.
 *  Everything else lives in the top menu on the home screen. */
export function MobileNav() {
  const pathname = usePathname();
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (pathname === "/login") return null;

  const links = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/tasks", label: t("nav.tasks"), icon: CheckSquare },
    { href: "/habits", label: t("nav.habits"), icon: Repeat },
    { href: "/relationships", label: t("nav.relationships"), icon: Users },
  ];

  const item = (l: (typeof links)[number]) => {
    const active = pathname === l.href;
    const Icon = l.icon;
    return (
      <Link
        key={l.href}
        href={l.href}
        className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
          active ? "text-accent" : "text-muted"
        }`}
      >
        <Icon size={20} />
        <span>{l.label}</span>
      </Link>
    );
  };

  return (
    <div ref={ref} className="sm:hidden">
      {open && (
        <div className="fixed inset-x-4 bottom-[4.75rem] z-50">
          <AddMenuList onSelect={() => setOpen(false)} />
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-end justify-around px-2">
          {item(links[0])}
          {item(links[1])}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? t("common.close") : t("addMenu.title")}
            className="-mt-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-bg shadow-lg transition hover:opacity-90"
          >
            {open ? <X size={22} /> : <Plus size={22} />}
          </button>
          {item(links[2])}
          {item(links[3])}
        </div>
      </nav>
    </div>
  );
}
