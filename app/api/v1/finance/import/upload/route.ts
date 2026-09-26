import { NextRequest, NextResponse } from "next/server";
import { badRequest, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { financeImportUserId } from "@/lib/api/finance-import-user";
import { FinanceImportLayerError, runFinanceImport } from "@/lib/finance/import/run-import";
import type { FinanceImportSource } from "@/lib/finance/import/types";
import { withRouteHandler } from "@/lib/api/with-route-handler";

const SOURCE_HINTS = new Set<FinanceImportSource>(["leumi", "cal", "max", "excel", "manual"]);
const MAX_BYTES = 12 * 1024 * 1024;

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  type UploadForm = { get(name: string): FormDataEntryValue | null };
  let form: UploadForm;
  try {
    form = (await req.formData()) as unknown as UploadForm;
  } catch {
    return badRequest("invalid_form_data");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("file_required");
  if (file.size <= 0) return badRequest("empty_file");
  if (file.size > MAX_BYTES) return badRequest("file_too_large");

  const sourceRaw = form.get("source");
  const sourceHint =
    typeof sourceRaw === "string" && SOURCE_HINTS.has(sourceRaw as FinanceImportSource)
      ? (sourceRaw as FinanceImportSource)
      : null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const userId = await financeImportUserId(req);

  try {
    const summary = await runFinanceImport({
      userId,
      filename: file.name,
      buffer,
      mime: file.type,
      sourceHint,
    });
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof FinanceImportLayerError) {
      if (err.code === "tables_missing") {
        return NextResponse.json({ error: err.message, soft: true }, { status: 503 });
      }
      return badRequest(err.message);
    }
    const msg = err instanceof Error ? err.message : "import_failed";
    return badRequest(msg);
  }
});
