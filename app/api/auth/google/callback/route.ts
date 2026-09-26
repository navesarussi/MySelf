import { NextRequest } from "next/server";
import { handleGoogleOAuthCallback } from "@/lib/integrations/google-oauth-callback";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  return handleGoogleOAuthCallback(req);
});
