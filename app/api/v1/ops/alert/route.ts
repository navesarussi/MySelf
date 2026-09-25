import { NextRequest, NextResponse } from "next/server";
import { badRequest, denyUnlessPrimary, readJson } from "@/lib/api/auth";
import { sendOpsAlert } from "@/lib/ops/alert";

/**
 * POST { title, body, ref } — push an operator alert to the primary account.
 *
 * Called by the post-deploy smoke workflow when a read endpoint fails. It sits
 * under /api/v1 so it takes the same session token the smoke test already
 * minted, and is primary-only: a guest account must not page the operator.
 */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;

  const input = await readJson(req);
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 1000) : "";
  const ref = typeof input.ref === "string" ? input.ref.trim().slice(0, 80) : "";
  if (!title || !body || !ref) return badRequest("title_body_ref_required");

  const result = await sendOpsAlert({ title, body, ref: `ops:${ref}` });
  return NextResponse.json({ ok: result !== null, result });
}
