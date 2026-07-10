import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, makeSessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const sitePassword = process.env.SITE_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (!sitePassword || !secret) {
    return NextResponse.json(
      { error: "האתר לא הוגדר כראוי (חסרים משתני סביבה)" },
      { status: 500 }
    );
  }

  if (password !== sitePassword) {
    return NextResponse.json({ error: "סיסמה שגויה" }, { status: 401 });
  }

  const token = await makeSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
