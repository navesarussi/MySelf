"use client";

import dynamic from "next/dynamic";

const ToastHost = dynamic(
  () => import("@/components/toast-host").then((m) => m.ToastHost),
  { ssr: false }
);

export function ToastLoader() {
  return <ToastHost />;
}
