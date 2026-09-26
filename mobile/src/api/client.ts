export class ApiError extends Error {
  status: number;
  userMessageHe?: string;
  localOnlyAllowed?: boolean;
  constructor(
    status: number,
    message: string,
    extras?: { userMessageHe?: string; localOnlyAllowed?: boolean }
  ) {
    super(message);
    this.status = status;
    this.userMessageHe = extras?.userMessageHe;
    this.localOnlyAllowed = extras?.localOnlyAllowed;
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
    const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const message = payload?.error ? String(payload.error) : `http_${res.status}`;
    const userMessageHe =
      typeof payload?.user_message_he === "string" ? payload.user_message_he : undefined;
    const localOnlyAllowed = payload?.local_only_allowed === true;
    void import("../error-reporting").then(({ reportClientError }) =>
      reportClientError({
        message,
        name: "ApiError",
        route: path,
        httpStatus: res.status,
        userAction: `${init?.method ?? "GET"} ${path}`,
        upstreamBody: data,
      })
    );
    throw new ApiError(res.status, message, { userMessageHe, localOnlyAllowed });
  }
  return data as T;
}
