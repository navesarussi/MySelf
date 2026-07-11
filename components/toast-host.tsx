"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FLASH_COOKIE, parseFlash, type FlashPayload } from "@/lib/flash";

function readClientFlash(): FlashPayload | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${FLASH_COOKIE}=`));
  if (!match) return null;
  const raw = decodeURIComponent(match.slice(FLASH_COOKIE.length + 1));
  return parseFlash(raw);
}

function clearClientFlash() {
  document.cookie = `${FLASH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function ToastHost() {
  const pathname = usePathname();
  const [toast, setToast] = useState<FlashPayload | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    function show(payload: FlashPayload) {
      clearClientFlash();
      setToast(payload);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setToast(null), 3200);
    }

    function tick() {
      const payload = readClientFlash();
      if (payload) show(payload);
    }

    tick();

    const onSubmit = () => window.setTimeout(tick, 120);
    const onFocus = () => tick();

    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("focus", onFocus);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [pathname]);

  if (!toast) return null;

  const tone =
    toast.tone === "error"
      ? "border-warn/40 bg-warn/15 text-warn"
      : "border-good/40 bg-good/15 text-good";

  return (
    <div
      role="status"
      className={`fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur ${tone}`}
    >
      {toast.message}
    </div>
  );
}
