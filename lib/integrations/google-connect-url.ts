/** Build unified Google OAuth URL (calendar + tasks + Gmail) for web or mobile. */
export function googleConnectUrl(origin: string, opts?: { appRedirect?: string; next?: string }) {
  const params = new URLSearchParams({ next: opts?.next ?? "/settings" });
  if (opts?.appRedirect) params.set("app_redirect", opts.appRedirect);
  return `${origin}/api/auth/google/login?${params}`;
}
