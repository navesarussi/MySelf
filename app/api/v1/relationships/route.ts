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
  const reminder = str(body.reminder_days);
  const { data, error } = await getSupabase()
    .from("relationships")
    .insert({
      name,
      group_name: optStr(body.group_name),
      reminder_days: reminder ? Number(reminder) : null,
      notes: optStr(body.notes),
      phone: phoneRaw ? normalizePhone(phoneRaw) : null,
      project_id,
    })
    .select()
    .single();
  if (error) return dbError();
  revalidateRelationshipPaths();
  return NextResponse.json(data, { status: 201 });
}
