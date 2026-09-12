export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type ApiConfig = { serverUrl: string; token: string };

let appVersion = "unknown";

/** Called once at app startup (mobile/app/_layout.tsx) with the real app version. */
export function setAppVersion(version: string) {
  appVersion = version;
}

export async function apiFetch<T>(
  config: ApiConfig,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  if (!config.serverUrl) throw new ApiError(0, "no_server");
  const res = await fetch(`${config.serverUrl}/api/v1${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      // Lets version-gated endpoints tell a not-yet-updated native build
      // apart from a current one, since old installs keep running until the
      // user updates (unlike the web export, which is rebuilt every deploy).
      "X-App-Version": appVersion,
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response (e.g. HTML error page)
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `http_${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}
