export type FlashPayload = {
  message: string;
  tone: "success" | "error";
};

export const FLASH_COOKIE = "myself_flash";

export function setFlashCookie(
  jar: { set: (name: string, value: string, options: Record<string, unknown>) => void },
  message: string,
  tone: FlashPayload["tone"] = "success"
) {
  jar.set(FLASH_COOKIE, JSON.stringify({ message, tone } satisfies FlashPayload), {
    path: "/",
    maxAge: 10,
    httpOnly: false,
    sameSite: "lax",
  });
}

export function parseFlash(raw: string | undefined): FlashPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FlashPayload;
  } catch {
    return null;
  }
}
