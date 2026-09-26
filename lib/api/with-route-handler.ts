import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/error-reporting";
import { sessionIdentity } from "@/lib/api/auth";

// Dynamic segments pass `{ params: Promise<...> }`; static routes omit the second arg.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: NextRequest, ctx?: any) => Promise<Response> | Response;

function inferSource(pathname: string): "server" | "cron" {
  if (
    pathname.startsWith("/api/trading/") ||
    pathname.startsWith("/api/agent/") ||
    pathname.startsWith("/api/push/") ||
    pathname.includes("/sync")
  ) {
    return "cron";
  }
  return "server";
}

async function reportFromRoute(
  req: NextRequest,
  error: unknown,
  httpStatus?: number
): Promise<void> {
  const pathname = req.nextUrl.pathname;
  const identity = await sessionIdentity(req).catch(() => null);
  reportError({
    source: inferSource(pathname),
    error,
    context: {
      method: req.method,
      path: pathname,
      route: pathname,
      httpStatus,
      userId: identity?.sub,
    },
  });
}

export function withRouteHandler(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, ctx?: unknown) => {
    try {
      const res = await handler(req, ctx);
      if (res.status >= 500) {
        let message = `http_${res.status}`;
        try {
          const clone = res.clone();
          const data = (await clone.json()) as { error?: unknown };
          if (data?.error) message = String(data.error);
        } catch {
          // ignore non-json 5xx bodies
        }
        void reportFromRoute(req, new Error(message), res.status);
      }
      return res;
    } catch (error) {
      void reportFromRoute(req, error, 500);
      console.error(`[route] ${req.method} ${req.nextUrl.pathname}`, error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "internal_error" },
        { status: 500 }
      );
    }
  };
}
