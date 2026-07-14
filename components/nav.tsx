"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { useTranslations } from "@/components/locale-provider";
import { SHOW_PROJECTS } from "@/lib/features";
import { APP_VERSION } from "@/lib/version";

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { t } = useTranslations();

  const links = [
    { href: "/", label: t("nav.home") },
    { href: "/timeline", label: t("nav.timeline") },
    { href: "/tasks", label: t("nav.tasks") },
    ...(SHOW_PROJECTS ? [{ href: "/projects", label: t("nav.projects") }] : []),
    { href: "/habits", label: t("nav.habits") },
    { href: "/goals", label: t("nav.goals") },
    { href: "/relationships", label: t("nav.relationships") },
    { href: "/library", label: t("nav.library") },
    { href: "/settings", label: t("nav.settings") },
  ];

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="flex items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <AppLogo size={28} priority />
        <span className="flex flex-col leading-tight">
          <span>{t("nav.brand")}</span>
          <span className="text-[10px] font-normal text-muted">v{APP_VERSION}</span>
        </span>
      </Link>

      <nav className="hidden items-center gap-1 sm:flex">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                active
                  ? "bg-accent text-bg font-medium"
                  : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
        <button
          onClick={logout}
          className="ms-2 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted hover:text-warn"
          title={t("nav.logout")}
        >
          <LogOut size={14} />
        </button>
      </nav>

      <button className="sm:hidden" onClick={() => setOpen((v) => !v)} aria-label={t("nav.menu")}>
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>

      {open && (
        <div className="card absolute inset-x-4 top-16 z-50 flex flex-col gap-1 p-2 sm:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-2 text-sm ${
                pathname === l.href ? "bg-accent text-bg font-medium" : ""
              }`}
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={logout}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-start text-sm text-warn"
          >
            <LogOut size={14} /> {t("nav.logout")}
          </button>
        </div>
      )}
    </header>
  );
}
