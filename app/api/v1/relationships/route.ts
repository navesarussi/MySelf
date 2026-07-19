import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/integrations/phone";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import type { Relationship } from "@/lib/types";

type RelRow = Relationship & { projects: { name: string } | null };

function revalidateRelationshipPaths() {
  revalidatePath("/relationships");
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { data, error } = await getSupabase()
    .from("relationships")
    .select("*, projects(name)")
    .order("name");
  if (error) return dbError();
  const relationships = ((data as RelRow[]) || []).map((row) => ({
    ...row,
    project_name: row.projects?.name,
    projects: undefined,
  }));
  return NextResponse.json(relationships);
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const name = str(body.name);
  const project_id = str(body.project_id);
  if (!name) return badRequest("name_required");
  if (!project_id) return badRequest("project_required");

  const phoneRaw = str(body.phone);
  const reminderRaw =
    typeof body.reminder_days === "number" ? body.reminder_days : Number(str(body.reminder_days));
  const reminder =
    Number.isFinite(reminderRaw) && reminderRaw > 0 ? Math.floor(reminderRaw) : 7;

  const row = {
    name,
    group_name: optStr(body.group_name),
    reminder_days: reminder,
    notes: optStr(body.notes),
    phone: phoneRaw ? normalizePhone(phoneRaw) || null : null,
    email: optStr(body.email),
    project_id,
  };

  const supabase = getSupabase();
  let { data, error } = await supabase.from("relationships").insert(row).select().single();

  // Older DBs may lack the email column — retry without it.
  if (error && /email/i.test(error.message || "")) {
    const { email: _email, ...withoutEmail } = row;
    ({ data, error } = await supabase.from("relationships").insert(withoutEmail).select().single());
  }

  if (error) {
    console.error("[relationships POST]", error.message, error.code, error.details);
    return dbError(error.message || "db_error");
  }
  revalidateRelationshipPaths();
  return NextResponse.json(data, { status: 201 });
}
