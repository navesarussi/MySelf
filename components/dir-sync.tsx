"use client";

import { useEffect } from "react";
import { useTranslations } from "@/components/locale-provider";

export function DirSync() {
  const { locale, isRtl } = useTranslations();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
  }, [locale, isRtl]);
  return null;
}
