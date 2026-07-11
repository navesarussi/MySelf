"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";

const links = [
  { href: "/", label: "בית" },
  { href: "/timeline", label: "ציר זמן" },
  { href: "/tasks", label: "משימות" },
  { href: "/habits", label: "הרגלים ומטרות" },
  { href: "/relationships", label: "קשרים" },
  { href: "/library", label: "ספריית תוכן" },
];


export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="flex items-center justify-between gap-4">
      <Link href="/" className="text-lg font-bold tracking-tight">
        מרכז השליטה
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
          title="התנתקות"
        >
          <LogOut size={14} />
        </button>
      </nav>

      <button
        className="sm:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-label="תפריט"
      >
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
            <LogOut size={14} /> התנתקות
          </button>
        </div>
      )}
    </header>
  );
}
