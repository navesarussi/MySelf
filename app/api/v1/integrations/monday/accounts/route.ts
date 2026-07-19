import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized, dbError } from "@/lib/api/auth";
import { MONDAY_PROVIDER } from "@/lib/integrations/monday-config";
import { listIntegrationTokens } from "@/lib/integrations/tokens";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  try {
    const rows = await listIntegrationTokens(MONDAY_PROVIDER);
    const supabase = getSupabase();

    const accounts = await Promise.all(
      rows.map(async (row) => {
        const settings = row.settings ?? {};
        const { data: taskRows } = await supabase
          .from("tasks")
          .select("external_list_id")
          .eq("source", "monday")
          .like("external_id", `${row.account_key}:%`);

        const task_count_by_board: Record<string, number> = {};
        for (const t of taskRows ?? []) {
          const boardId = t.external_list_id;
          if (!boardId) continue;
          task_count_by_board[boardId] = (task_count_by_board[boardId] ?? 0) + 1;
        }
        const task_count = Object.values(task_count_by_board).reduce((a, b) => a + b, 0);

        return {
          account_key: row.account_key,
          account_name: (settings.account_name as string) ?? row.account_key,
          account_slug: (settings.account_slug as string) ?? null,
          connected: true,
          last_sync_at: row.last_sync_at,
          sync_status: row.sync_status,
          selected_list_ids: (settings.selected_list_ids as string[]) ?? [],
          task_count,
          task_count_by_board,
        };
      })
    );

    return NextResponse.json({ accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    console.error("[monday-accounts]", message);
    return dbError(message);
  }
}
