import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, notFound, optStr, readJson, str, unauthorized } from "@/lib/api/auth";

type Params = { params: Promise<{ id: string }> };

function revalidateGoalPaths() {
  revalidatePath("/goals");
  revalidatePath("/");
}

/** PATCH {toggle_status:true} flips active/done; otherwise edits fields. */
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  if (!id) return badRequest("id_required");
  const supabase = getSupabase();

  if (body.toggle_status === true) {
    const { data: goal } = await supabase.from("goals").select("status").eq("id", id).maybeSingle();
    if (!goal) return notFound();
    const { data, error } = await supabase
      .from("goals")
      .update({ status: goal.status === "active" ? "done" : "active" })
      .eq("id", id)
      .select()
      .single();
    if (error) return dbError();
    revalidateGoalPaths();
    return NextResponse.json(data);
  }

  const title = str(body.title);
  if (!title) return badRequest("title_required");
  const { data, error } = await supabase
    .from("goals")
    .update({
      title,
      category: optStr(body.category),
      horizon: optStr(body.horizon),
      first_step: optStr(body.first_step),
      definition_of_done: optStr(body.definition_of_done),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return dbError();
  revalidateGoalPaths();
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");
  const { error } = await getSupabase().from("goals").delete().eq("id", id);
  if (error) return dbError();
  revalidateGoalPaths();
  return NextResponse.json({ ok: true });
}
