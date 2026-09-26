import { reportError } from "@/lib/error-reporting";

type RequestErrorContext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
};

type InstrumentationRequest = {
  path?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

export async function register() {
  // No-op — hook exists so Next.js loads onRequestError.
}

export async function onRequestError(
  error: unknown,
  request: InstrumentationRequest,
  context: RequestErrorContext
) {
  const path = request.path ?? context.routePath ?? null;
  reportError({
    source: path?.includes("/api/trading") || path?.includes("/api/agent") ? "cron" : "server",
    error,
    context: {
      method: request.method,
      path: path ?? undefined,
      route: path ?? undefined,
    },
  });
}
