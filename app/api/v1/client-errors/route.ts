import { NextRequest, NextResponse } from "next/server";
import { badRequest, readJson, sessionIdentity, unauthorized } from "@/lib/api/auth";
import { withRouteHandler } from "@/lib/api/with-route-handler";
import { isPrimaryGoogleEmail } from "@/lib/integrations/google-auth";
import {
  getWebhookConfig,
  MAINTAINER_TEST_HEADER,
  reportError,
  verifyMaintainerTestHeader,
  type ErrorSource,
} from "@/lib/error-reporting";

const ANON_WINDOW_MS = 60_000;
const ANON_MAX = 10;
const anonHits = new Map<string, { count: number; resetAt: number }>();

function anonAllowed(ip: string): boolean {
  const now = Date.now();
  const row = anonHits.get(ip);
  if (!row || now >= row.resetAt) {
    anonHits.set(ip, { count: 1, resetAt: now + ANON_WINDOW_MS });
    return true;
  }
  row.count += 1;
  return row.count <= ANON_MAX;
}

function pickSource(value: unknown, platform: unknown): ErrorSource {
  if (value === "mobile-ios" || value === "web" || value === "server" || value === "cron") {
    return value;
  }
  if (platform === "ios") return "mobile-ios";
  return "web";
}

async function isMaintainerTestRequest(req: NextRequest): Promise<boolean> {
  const config = await getWebhookConfig();
  return verifyMaintainerTestHeader(req.headers.get(MAINTAINER_TEST_HEADER), config?.key);
}

async function handlePost(req: NextRequest) {
  const body = await readJson(req);
  const test = body.test === true;
  const identity = await sessionIdentity(req);
  const maintainerTest = test ? await isMaintainerTestRequest(req) : false;

  if (test) {
    if (
      !maintainerTest &&
      (!identity || !(await isPrimaryGoogleEmail(identity.sub)))
    ) {
      return unauthorized();
    }
    reportError({
      source: "server",
      error: new Error(
        maintainerTest ? "error_reporting_test_maintainer" : "error_reporting_test"
      ),
      context: {
        test: true,
        userId: identity?.sub,
        userAction: maintainerTest ? "maintainer_header_test" : "primary_session_test",
        route: "/api/v1/client-errors",
      },
    });
    return NextResponse.json({ ok: true, test: true, maintainer: maintainerTest });
  }

  if (!identity) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (!anonAllowed(ip)) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return badRequest("message_required");

  const name = typeof body.name === "string" ? body.name.trim() : "Error";
  const stack = typeof body.stack === "string" ? body.stack : null;
  const source = pickSource(body.source, body.platform);

  reportError({
    source,
    error: Object.assign(new Error(message), { name, stack: stack ?? undefined }),
    context: {
      screen: typeof body.screen === "string" ? body.screen : undefined,
      route: typeof body.route === "string" ? body.route : undefined,
      userAction: typeof body.userAction === "string" ? body.userAction : undefined,
      appVersion: typeof body.appVersion === "string" ? body.appVersion : undefined,
      platform: typeof body.platform === "string" ? body.platform : undefined,
      httpStatus: typeof body.httpStatus === "number" ? body.httpStatus : undefined,
      integration: typeof body.integration === "string" ? body.integration : undefined,
      userId: identity?.sub,
      upstreamBody: body.upstreamBody,
    },
  });

  return NextResponse.json({ ok: true });
}

export const POST = withRouteHandler(handlePost);
