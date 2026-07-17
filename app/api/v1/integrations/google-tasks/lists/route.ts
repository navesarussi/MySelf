import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized, dbError } from "@/lib/api/auth";
import { GOOGLE_TASKS_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken } from "@/lib/integrations/tokens";
import { createGoogleTasksProvider } from "@/lib/integrations/task-sources/google-tasks/provider";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const token = await getIntegrationToken(GOOGLE_TASKS_PROVIDER);
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  try {
    const provider = createGoogleTasksProvider();
    const lists = await provider.listSources();
    return NextResponse.json(lists);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    console.error("[google-tasks-lists]", message);
    return dbError(message);
  }
}
