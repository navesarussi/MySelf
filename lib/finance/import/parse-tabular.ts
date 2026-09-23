import { createHash } from "crypto";
import type { ParseFileResult, ParsedImportTransaction } from "@/lib/finance/import/types";

const DATE_ALIASES = ["date", "txn_date", "booked_at", "תאריך", "תאריך עסקה", "תאריך חיוב"];
const AMOUNT_ALIASES = ["amount", "sum", "value", "סכום", "סכום חיוב", "סכום העסקה"];
const DESC_ALIASES = ["description", "details", "memo", "note", "תיאור", "פרטים", "פירוט"];
const MERCHANT_ALIASES = ["merchant", "payee", "vendor", "שם", "בית עסק", "ספק"];

type Row = Record<string, string>;

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function pickColumn(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => ({ raw: h, norm: normHeader(h) }));
  for (const alias of aliases) {
    const hit = normalized.find((h) => h.norm === alias.toLowerCase() || h.norm.includes(alias.toLowerCase()));
    if (hit) return hit.raw;
  }
  return null;
}

function parseDateCell(raw: string): string | null {
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!dmy) return null;
  let year = dmy[3];
  if (year.length === 2) year = `20${year}`;
  const month = dmy[2].padStart(2, "0");
  const day = dmy[1].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseAmountCell(raw: string): { amount: number; kind: "income" | "expense" } | null {
  const cleaned = raw.replace(/[₪,\s]/g, "").trim();
  if (!cleaned) return null;
  const negative = cleaned.startsWith("-") || cleaned.startsWith("(");
  const n = Number(cleaned.replace(/[()]/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return { amount: Math.abs(n), kind: negative ? "expense" : "income" };
}

function hashRef(parts: Record<string, string | number>): string {
  const raw = Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
  return `tabular:${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

function rowsFromObjects(objects: Row[]): ParseFileResult {
  const warnings: string[] = [];
  if (objects.length === 0) {
    return {
      source: "excel",
      accountLabel: "Excel/CSV",
      accountMetadata: { row_count: 0 },
      transactions: [],
      warnings: ["empty_file"],
    };
  }

  const headers = Object.keys(objects[0] ?? {});
  const dateCol = pickColumn(headers, DATE_ALIASES);
  const amountCol = pickColumn(headers, AMOUNT_ALIASES);
  const descCol = pickColumn(headers, DESC_ALIASES);
  const merchantCol = pickColumn(headers, MERCHANT_ALIASES);

  if (!dateCol || !amountCol) {
    return {
      source: "excel",
      accountLabel: "Excel/CSV",
      accountMetadata: { headers },
      transactions: [],
      warnings: ["missing_required_columns"],
    };
  }

  const transactions: ParsedImportTransaction[] = [];
  const errors: string[] = [];

  objects.forEach((row, idx) => {
    const booked = parseDateCell(row[dateCol] ?? "");
    const amt = parseAmountCell(row[amountCol] ?? "");
    if (!booked || !amt) {
      errors.push(`row_${idx + 1}`);
      return;
    }
    const description = (descCol ? row[descCol] : "")?.trim() || (merchantCol ? row[merchantCol] : "")?.trim() || "Import";
    const merchant = merchantCol ? row[merchantCol]?.trim() || null : null;
    transactions.push({
      booked_at: booked,
      amount: amt.amount,
      kind: amt.kind,
      description,
      merchant,
      currency: "ILS",
      source_ref: hashRef({ d: booked, a: amt.amount, desc: description, i: idx }),
      raw: { row: idx + 1 },
    });
  });

  if (errors.length) warnings.push(`parse_errors:${errors.length}`);

  return {
    source: "excel",
    accountLabel: "Excel/CSV",
    accountMetadata: { headers, parsed_rows: objects.length },
    transactions,
    warnings,
  };
}

export function parseCsvText(text: string): ParseFileResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      source: "excel",
      accountLabel: "CSV",
      accountMetadata: {},
      transactions: [],
      warnings: ["empty_file"],
    };
  }

  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));
  const objects: Row[] = lines.slice(1).map((line) => {
    const cells = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });

  return rowsFromObjects(objects);
}

export async function parseXlsxBuffer(buffer: Buffer): Promise<ParseFileResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      source: "excel",
      accountLabel: "Excel",
      accountMetadata: {},
      transactions: [],
      warnings: ["empty_workbook"],
    };
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
  const result = rowsFromObjects(rows);
  result.accountLabel = `Excel (${sheetName})`;
  return result;
}
