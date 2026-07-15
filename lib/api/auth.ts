import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";

/** Route-level auth check for /api/v1 handlers — defense in depth on top of
 *  proxy.ts. Accepts the session token as a Bearer header or the cookie. */
export async function isApiAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  if (await isValidSessionToken(bearer, secret)) return true;
  const jar = await cookies();
  return isValidSessionToken(jar.get(SESSION_COOKIE)?.value, secret);
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function dbError(message = "db_error") {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

/** Body parse that tolerates empty bodies. */
export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const data = (await req.json()) as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export const optStr = (v: unknown) => {
  const s = str(v);
  return s || null;
};
