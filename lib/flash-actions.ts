"use server";

import { cookies } from "next/headers";
import { FLASH_COOKIE, type FlashPayload } from "@/lib/flash";

export async function setFlash(message: string, tone: FlashPayload["tone"] = "success") {
  const jar = await cookies();
  jar.set(FLASH_COOKIE, JSON.stringify({ message, tone } satisfies FlashPayload), {
    path: "/",
    maxAge: 10,
    httpOnly: false,
    sameSite: "lax",
  });
}
