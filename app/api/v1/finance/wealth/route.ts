import { NextRequest, NextResponse } from "next/server";
import { badRequest, dbError, isApiAuthorized, readJson, unauthorized } from "@/lib/api/auth";
import { parseWealthImportText } from "@/lib/finance/har-bituach-parse";
import { getWealthSummary, importWealthItems, upsertWealthItem } from "@/lib/finance/wealth-store";
import type { WealthCategory, WealthSource } from "@/lib/finance/wealth-types";

const CATEGORIES = new Set<WealthCategory>(["pension", "insurance", "investment", "property", "other"]);
const SOURCES = new Set<WealthSource>(["manual", "cover_import", "har_bituach", "agent"]);

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  try {
    const summary = await getWealthSummary();
    return NextResponse.json(summary);
  } catch {
    return dbError();
  }
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);

  if (body.import_text && typeof body.import_text === "string") {
    const source = SOURCES.has(body.source as WealthSource) ? (body.source as WealthSource) : "har_bituach";
    const parsed = parseWealthImportText(body.import_text);
    if (parsed.length === 0) return badRequest("no_items_parsed");
    try {
      const { items, created, updated } = await importWealthItems(
        parsed.map((p) => ({
          ...p,
          source,
          as_of_date:
            typeof body.as_of_date === "string"
              ? body.as_of_date
              : new Date().toISOString().slice(0, 10),
        }))
      );
      const summary = await getWealthSummary();
      return NextResponse.json({ imported: items.length, created, updated, summary });
    } catch {
      return dbError();
    }
  }

  const category = body.category as WealthCategory;
  if (!CATEGORIES.has(category)) return badRequest("invalid_category");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name_required");
  const balance = Number(body.balance);
  if (!Number.isFinite(balance) || balance < 0) return badRequest("invalid_balance");

  try {
    const item = await upsertWealthItem({
      category,
      name,
      provider: typeof body.provider === "string" ? body.provider : null,
      balance,
      notes: typeof body.notes === "string" ? body.notes : null,
      source: SOURCES.has(body.source as WealthSource) ? (body.source as WealthSource) : "manual",
      as_of_date: typeof body.as_of_date === "string" ? body.as_of_date : null,
    });
    return NextResponse.json(item);
  } catch {
    return dbError();
  }
}
