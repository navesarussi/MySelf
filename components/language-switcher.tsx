"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/lib/i18n/actions";
import { useTranslations } from "@/components/locale-provider";
import type { Locale } from "@/lib/i18n";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, t } = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      className={`flex items-center gap-1 ${compact ? "" : "rounded-full bg-border/40 p-0.5"}`}
      role="group"
      aria-label={t("language.label")}
    >
      {(["he", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          disabled={pending}
          onClick={() => switchTo(code)}
          className={`rounded-full px-2.5 py-1 text-xs transition ${
            locale === code
              ? "bg-accent text-bg font-medium"
              : "text-muted hover:text-ink"
          }`}
          aria-pressed={locale === code}
        >
          {t(`language.${code}`)}
        </button>
      ))}
    </div>
  );
}
