import { cookies } from "next/headers";

export type FlashPayload = {
  message: string;
  tone: "success" | "error";
};

const COOKIE = "myself_flash";

export async function setFlash(message: string, tone: FlashPayload["tone"] = "success") {
  const jar = await cookies();
  jar.set(COOKIE, JSON.stringify({ message, tone } satisfies FlashPayload), {
    path: "/",
    maxAge: 8,
    httpOnly: false,
    sameSite: "lax",
  });
}

export async function readFlash(): Promise<FlashPayload | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  jar.delete(COOKIE);
  try {
    return JSON.parse(raw) as FlashPayload;
  } catch {
    return null;
  }
}
