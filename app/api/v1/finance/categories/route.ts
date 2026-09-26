import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";
import { listFinanceCategories } from "@/lib/finance/category-list";
import { fetchCategoryMeta, mergeCategories, renameCategory, upsertCategoryMeta } from "@/lib/finance/category-mgmt";
import type { MoneyItemType } from "@/lib/finance/money-item-type";
import { reportError } from "@/lib/error-reporting";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  try {
    const [categories, meta] = await Promise.all([listFinanceCategories(), fetchCategoryMeta()]);
    const enriched = categories.map((name) => {
      const m = meta.get(name);
      return {
        name,
        default_type: m?.default_type ?? null,
        weekly_budget: m?.weekly_budget ?? null,
        is_builtin: m?.is_builtin ?? false,
      };
    });
    return NextResponse.json({ categories: enriched });
  } catch (err) {
    reportError({ source: "server", error: err, context: { route: "/finance/categories GET", integration: "finance" } });
    return dbError();
  }
});

export const PATCH = withRouteHandler(async function PATCH(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const action = str(body.action);

  try {
    if (action === "rename") {
      await renameCategory(str(body.from), str(body.to));
      return NextResponse.json({ ok: true });
    }
    if (action === "merge") {
      await mergeCategories(str(body.from), str(body.to));
      return NextResponse.json({ ok: true });
    }
    if (action === "update") {
      const name = str(body.name);
      const default_type = body.default_type as MoneyItemType | null | undefined;
      if (default_type && !["fixed", "variable", "income", "internal"].includes(default_type)) {
        return badRequest("invalid_default_type");
      }
      const meta = await upsertCategoryMeta({
        name,
        default_type: default_type ?? null,
        weekly_budget: body.weekly_budget !== undefined ? Number(body.weekly_budget) : undefined,
      });
      return NextResponse.json(meta);
    }
    return badRequest("unknown_action");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "update_failed";
    reportError({ source: "server", error: err, context: { route: "/finance/categories PATCH", integration: "finance" } });
    return badRequest(msg);
  }
});
