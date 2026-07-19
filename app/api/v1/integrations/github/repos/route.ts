import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized, dbError } from "@/lib/api/auth";
import { GITHUB_PROVIDER } from "@/lib/integrations/github-config";
import { getIntegrationToken } from "@/lib/integrations/tokens";
import { createGithubProvider } from "@/lib/integrations/task-sources/github/provider";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const token = await getIntegrationToken(GITHUB_PROVIDER);
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  try {
    const provider = createGithubProvider();
    const lists = await provider.listSources();
    return NextResponse.json(lists);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    console.error("[github-repos]", message);
    return dbError(message);
  }
}
