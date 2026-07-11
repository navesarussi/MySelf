"use client";

import { useEffect, useState } from "react";
import type { FlashPayload } from "@/lib/flash";

export function ToastHost({ initial }: { initial: FlashPayload | null }) {
  const [toast, setToast] = useState<FlashPayload | null>(initial);

  useEffect(() => {
    if (!initial) return;
    setToast(initial);
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [initial]);

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
