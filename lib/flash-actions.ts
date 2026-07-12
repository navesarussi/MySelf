"use server";

import { cookies } from "next/headers";
import { FLASH_COOKIE, type FlashPayload, setFlashCookie } from "@/lib/flash";
import { createTranslator, getLocale } from "@/lib/i18n";

export async function setFlash(key: string, tone: FlashPayload["tone"] = "success", params?: Record<string, string | number>) {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const jar = await cookies();
  setFlashCookie(jar, t(key, params), tone);
}
