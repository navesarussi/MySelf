"use client";

import Link from "next/link";
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
} from "lucide-react";
import { useTranslations } from "@/components/locale-provider";
import { addTargetHref, type AddTarget } from "@/lib/add-menu";
import { SHOW_PROJECTS } from "@/lib/features";

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

/** Shared "quick add" list — used by the desktop FAB and the mobile bottom bar. */
export function AddMenuList({
  onSelect,
  className = "",
}: {
  onSelect?: () => void;
  className?: string;
}) {
  const { t } = useTranslations();
  const items = MENU_ITEMS.filter((i) => SHOW_PROJECTS || i.target !== "project");

  return (
    <div className={`card overflow-hidden p-1 shadow-lg ${className}`}>
      <p className="px-3 py-2 text-xs font-medium text-muted">{t("addMenu.title")}</p>
      {items.map(({ target, icon: Icon }) => (
        <Link
          key={target}
          href={addTargetHref(target)}
          onClick={onSelect}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-border/40"
        >
          <Icon size={16} className="shrink-0 text-accent" />
          {t(`addMenu.${target}`)}
        </Link>
      ))}
    </div>
  );
}
