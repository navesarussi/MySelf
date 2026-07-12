"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppLogo } from "@/components/app-logo";
import { useTranslations } from "@/components/locale-provider";

function LoginContent() {
  const params = useSearchParams();
  const { t } = useTranslations();
  const next = params.get("next") || "/";
  const loginHref = `/api/auth/google/login?next=${encodeURIComponent(next)}`;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-sm space-y-4 p-6 text-center">
        <div className="flex flex-col items-center space-y-2">
          <AppLogo size={72} priority />
          <div className="space-y-1">
            <h1 className="text-xl font-bold">{t("nav.brand")}</h1>
            <p className="text-sm text-muted">{t("login.subtitle")}</p>
          </div>
        </div>

        <a
          href={loginHref}
          className="flex w-full items-center justify-center gap-2 rounded-lg border bg-bg px-3 py-2.5 text-sm font-medium hover:bg-surface"
        >
          <GoogleIcon />
          {t("common.signInGoogle")}
        </a>

        <p className="text-xs text-muted">
          {t("login.calendarNote")}{" "}
          <Link href="/privacy" className="underline hover:text-ink">
            {t("common.privacyPolicy")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.083 36 24 36c-5.522 0-10-4.478-10-10s4.478-10 10-10c2.52 0 4.847.93 6.617 2.463l6.082-6.082C33.891 9.953 29.136 8 24 8 12.955 8 4 16.955 4 28s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c2.52 0 4.847.93 6.617 2.463l6.082-6.082C33.891 9.953 29.136 8 24 8 12.955 8 4 16.955 4 28c0 3.064.6 5.991 1.683 8.655l6.623-4.964z"
      />
      <path
        fill="#4CAF50"
        d="M24 48c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 38.977 26.713 40 24 40c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 43.556 16.227 48 24 48z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
