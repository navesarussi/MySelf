import { cookies } from "next/headers";

/** Remembers the last project a task/contact was filed under, so the add form
 *  keeps defaulting to it until something is filed under a different project. */
const COOKIE_PREFIX = "last_project_";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function rememberLastProject(scope: string, projectId: string) {
  if (!projectId) return;
  const jar = await cookies();
  jar.set(`${COOKIE_PREFIX}${scope}`, projectId, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
}

export async function getLastProject(scope: string): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(`${COOKIE_PREFIX}${scope}`)?.value || undefined;
}
