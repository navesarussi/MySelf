"use client";

import { useEffect } from "react";

function reportWebShellError(error: Error, userAction: string) {
  void fetch("/api/v1/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "web",
      name: error.name,
      message: error.message,
      stack: error.stack,
      userAction,
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
    }),
  }).catch(() => {});
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportWebShellError(error, "next_global_error");
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h2>Something went wrong</h2>
        <p>{error.message}</p>
        <button type="button" onClick={() => reset()}>
          Try again
        </button>
      </body>
    </html>
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    reportWebShellError(
      event.error instanceof Error ? event.error : new Error(event.message || "window_error"),
      "window_error"
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportWebShellError(
      reason instanceof Error ? reason : new Error(String(reason ?? "unhandled_rejection")),
      "unhandled_rejection"
    );
  });
}
