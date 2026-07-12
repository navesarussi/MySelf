"use server";

import { cookies } from "next/headers";
import { FLASH_COOKIE, type FlashPayload, setFlashCookie } from "@/lib/flash";

export async function setFlash(message: string, tone: FlashPayload["tone"] = "success") {
  const jar = await cookies();
  setFlashCookie(jar, message, tone);
}
