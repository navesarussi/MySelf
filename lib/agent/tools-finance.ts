import { withLog } from "@/lib/agent/tools-log";
import { tool } from "ai";
import { z } from "zod";
import { parseWealthImportText } from "@/lib/finance/har-bituach-parse";
import {
  deleteWealthItem,
  getWealthSummary,
  importWealthItems,
  upsertWealthItem,
} from "@/lib/finance/wealth-store";

const wealthCategory = z.enum(["pension", "insurance", "investment", "property", "other"]);

export function createFinanceAgentTools() {
  return {
    list_wealth: tool({
      description: "List wealth items (pension, insurance, investments, property) and totals.",
      inputSchema: z.object({}),
      execute: async () => withLog("list_wealth", {}, () => getWealthSummary()),
    }),

    upsert_wealth_item: tool({
      description:
        "Create or update a wealth snapshot item (e.g. from Cover screenshot). Use category pension/insurance/investment/property/other.",
      inputSchema: z.object({
        id: z.string().uuid().optional(),
        category: wealthCategory,
        name: z.string().min(1),
        provider: z.string().nullable().optional(),
        balance: z.number().min(0),
        notes: z.string().nullable().optional(),
        source: z.enum(["manual", "cover_import", "har_bituach", "agent"]).optional(),
        as_of_date: z.string().nullable().optional(),
      }),
      execute: async (input) =>
        withLog("upsert_wealth_item", input, () =>
          upsertWealthItem({ ...input, source: input.source ?? "agent" })
        ),
    }),

    import_wealth_text: tool({
      description:
        "Parse pasted text from Cover / הר הביטוח and import multiple wealth items at once.",
      inputSchema: z.object({
        text: z.string().min(10),
        source: z.enum(["cover_import", "har_bituach", "agent"]).optional(),
      }),
      execute: async (input) =>
        withLog("import_wealth_text", { text_len: input.text.length }, async () => {
          const parsed = parseWealthImportText(input.text);
          if (parsed.length === 0) return { imported: 0, error: "no_items_parsed" };
          // A snapshot re-import refreshes balances; `created` vs `updated`
          // lets the reply say so instead of implying everything was new.
          const { items, created, updated } = await importWealthItems(
            parsed.map((p) => ({
              ...p,
              source: input.source ?? "agent",
              as_of_date: new Date().toISOString().slice(0, 10),
            }))
          );
          return { imported: items.length, created, updated, items };
        }),
    }),

    delete_wealth_item: tool({
      description: "Delete a wealth item by id.",
      inputSchema: z.object({ id: z.string().uuid() }),
      execute: async (input) =>
        withLog("delete_wealth_item", input, async () => {
          await deleteWealthItem(input.id);
          return { ok: true };
        }),
    }),
  };
}
