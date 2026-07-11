export type FlashPayload = {
  message: string;
  tone: "success" | "error";
};

export const FLASH_COOKIE = "myself_flash";

export function parseFlash(raw: string | undefined): FlashPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FlashPayload;
  } catch {
    return null;
  }
}
