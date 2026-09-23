import type { ParseFileResult } from "@/lib/finance/import/types";
import {
  findHeaderRowIndex,
  mapTabularRows,
  parseDateCell,
  parseAmountCell,
  pickColumn,
  rowsToObjects,
} from "@/lib/finance/import/spreadsheet-utils";

type Row = Record<string, string | number>;

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

  const { transactions, warnings: mapWarnings, headers } = mapTabularRows({
    objects,
    dateAliases: ["date", "txn_date", "booked_at", "תאריך", "תאריך עסקה", "תאריך חיוב"],
    amountAliases: ["amount", "sum", "value", "סכום", "סכום חיוב", "סכום העסקה", 'סכום בש"ח'],
    descAliases: ["description", "details", "memo", "note", "תיאור", "פרטים", "פירוט"],
    merchantAliases: ["merchant", "payee", "vendor", "שם", "בית עסק", "שם בית עסק", "ספק"],
    refPrefix: "tabular",
  });

  return {
    source: "excel",
    accountLabel: "Excel/CSV",
    accountMetadata: { headers, parsed_rows: objects.length },
    transactions,
    warnings: [...warnings, ...mapWarnings],
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
  const wb = XLSX.read(buffer, { type: "buffer", raw: true });
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
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });

  const headerIdx = findHeaderRowIndex(matrix, [["תאריך", "date"], ["סכום", "amount"]]);
  const objects =
    headerIdx >= 0
      ? rowsToObjects(matrix, headerIdx)
      : XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });

  const result = rowsFromObjects(objects);
  result.accountLabel = `Excel (${sheetName})`;
  return result;
}

// Re-export for tests that import these directly
export { parseDateCell, parseAmountCell, pickColumn };
