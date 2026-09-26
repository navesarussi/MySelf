import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { userDb } from "@/lib/db/user-db";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";
import { withRouteHandler } from "@/lib/api/with-route-handler";

function revalidateProjectPaths() {
  for (const p of ["/projects", "/tasks", "/relationships", "/"]) revalidatePath(p);
}

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { data, error } = await (await userDb())
    .from("projects")
    .select("id, name, sort_order, created_at")
    .order("sort_order");
  if (error) return dbError();
  return NextResponse.json(data || []);
});

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const name = str(body.name);
  if (!name) return badRequest("name_required");


  const db = await userDb();
  const { data: existing } = await db.from("projects").select("id").eq("name", name).maybeSingle();
  if (existing) return badRequest("project_exists");

  const { data: maxRow } = await db
    .from("projects")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (maxRow?.sort_order ?? 0) + 10;

  const { data, error } = await db
    .from("projects")
    .insert({ name, sort_order })
    .select()
    .single();
  if (error) return dbError();
  revalidateProjectPaths();
  return NextResponse.json(data, { status: 201 });
});
