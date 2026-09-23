import type { FinanceImportSource, ParseFileResult } from "@/lib/finance/import/types";
import {
  findHeaderRowIndex,
  hashTabularRef,
  mapTabularRows,
  normHeader,
  parseAmountCell,
  parseDateCell,
  rowsToObjects,
} from "@/lib/finance/import/spreadsheet-utils";

type RowMatrix = unknown[][];

async function readSheetMatrix(buffer: Buffer): Promise<{ rows: RowMatrix; sheetName: string } | null> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return null;
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  return { rows, sheetName };
}

export function detectBankSpreadsheet(
  buffer: Buffer,
  filename: string,
  hint?: FinanceImportSource | null
): FinanceImportSource | null {
  if (hint === "cal" || hint === "leumi" || hint === "max") return hint;

  const head = buffer.slice(0, 4096).toString("utf8");
  const lowerName = filename.toLowerCase();

  if (head.includes("<HTML") || head.includes("תנועות בחשבון") || head.includes("בנק לאומי")) return "leumi";
  if (/transaction-details|max-it/i.test(lowerName) || head.includes("כל המשתמשים")) return "max";
  if (/פירוט עסקאות|כאל|cal-online/i.test(head) || /cal.*xlsx/i.test(lowerName)) return "cal";

  return null;
}

/** Cal «פירוט עסקאות וזיכויים» XLSX export. */
export async function parseCalXlsx(buffer: Buffer): Promise<ParseFileResult> {
  const sheet = await readSheetMatrix(buffer);
  if (!sheet) {
    return { source: "cal", accountLabel: "Cal", accountMetadata: {}, transactions: [], warnings: ["empty_workbook"] };
  }

  const headerIdx = findHeaderRowIndex(sheet.rows, [
    ["תאריך", "עסקה"],
    ["בית עסק", "שם"],
    ["סכום", "ש\"ח", "שח"],
  ]);
  if (headerIdx < 0) {
    return {
      source: "cal",
      accountLabel: "Cal Excel",
      accountMetadata: { format: "cal_xlsx" },
      transactions: [],
      warnings: ["missing_required_columns"],
    };
  }

  const objects = rowsToObjects(sheet.rows, headerIdx);
  const { transactions, warnings, headers } = mapTabularRows({
    objects,
    dateAliases: ["תאריך עסקה", "תאריך", "מועד חיוב"],
    amountAliases: ['סכום בש"ח', "סכום", "סכום חיוב"],
    descAliases: ["סוג עסקה", "הערות"],
    merchantAliases: ["שם בית עסק", "בית עסק"],
    refPrefix: "cal:xlsx",
    defaultKind: "expense",
  });

  return {
    source: "cal",
    accountLabel: "Cal Excel",
    accountMetadata: { format: "cal_xlsx", headers, parsed_rows: objects.length, sheet: sheet.sheetName },
    transactions,
    warnings,
  };
}

/** Max «transaction-details_export» XLSX. */
export async function parseMaxXlsx(buffer: Buffer): Promise<ParseFileResult> {
  const sheet = await readSheetMatrix(buffer);
  if (!sheet) {
    return { source: "max", accountLabel: "Max", accountMetadata: {}, transactions: [], warnings: ["empty_workbook"] };
  }

  const headerIdx = findHeaderRowIndex(sheet.rows, [
    ["תאריך עסקה", "תאריך"],
    ["בית העסק", "בית עסק"],
    ["סכום חיוב", "סכום"],
  ]);
  if (headerIdx < 0) {
    return {
      source: "max",
      accountLabel: "Max Excel",
      accountMetadata: { format: "max_xlsx" },
      transactions: [],
      warnings: ["missing_required_columns"],
    };
  }

  const objects = rowsToObjects(sheet.rows, headerIdx);
  const headers = Object.keys(objects[0] ?? {});
  const currencyCol =
    headers.find((h) => normHeader(h) === "מטבע חיוב" || normHeader(h).endsWith("מטבע חיוב")) ??
    headers.find((h) => normHeader(h).includes("מטבע חיוב")) ??
    headers.find((h) => normHeader(h).includes("מטבע עסקה")) ??
    null;

  const { transactions, warnings } = mapTabularRows({
    objects,
    dateAliases: ["תאריך עסקה", "תאריך חיוב", "תאריך"],
    amountAliases: ["סכום חיוב", "סכום עסקה", "סכום"],
    descAliases: ["קטגוריה", "הערות", "אופן ביצוע"],
    merchantAliases: ["שם בית העסק", "שם בית עסק", "בית עסק"],
    refPrefix: "max:xlsx",
    defaultKind: "expense",
    currencyCol,
  });

  return {
    source: "max",
    accountLabel: "Max Excel",
    accountMetadata: { format: "max_xlsx", headers, parsed_rows: objects.length, sheet: sheet.sheetName },
    transactions,
    warnings,
  };
}

function stripHtmlText(html: string): string {
  return html
    .replace(/<br[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLeumiHtmlTable(html: string): ParseFileResult {
  const tableStart = html.indexOf("תנועות בחשבון");
  if (tableStart < 0) {
    return {
      source: "leumi",
      accountLabel: "Leumi",
      accountMetadata: { format: "leumi_html_xls" },
      transactions: [],
      warnings: ["missing_required_columns"],
    };
  }

  const slice = html.slice(tableStart, tableStart + 500000);
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<td[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/gi;

  let headerMap: Record<string, number> | null = null;
  const transactions: ParseFileResult["transactions"] = [];
  const warnings: string[] = [];
  let rowIdx = 0;

  for (const rowMatch of slice.matchAll(rowRe)) {
    const rowHtml = rowMatch[1];
    const cells: { cls: string; text: string }[] = [];
    for (const cellMatch of rowHtml.matchAll(cellRe)) {
      cells.push({ cls: cellMatch[1], text: stripHtmlText(cellMatch[2]) });
    }
    if (cells.length < 5) continue;

    if (!headerMap) {
      const norms = cells.map((c) => normHeader(c.text));
      if (norms.some((n) => n.includes("תאריך")) && norms.some((n) => n.includes("בחובה"))) {
        headerMap = {};
        norms.forEach((n, i) => {
          if (n.includes("תאריך") && !n.includes("ערך") && headerMap!.date == null) headerMap!.date = i;
          else if (n.includes("תיאור")) headerMap!.desc = i;
          else if (n.includes("בחובה")) headerMap!.debit = i;
          else if (n.includes("בזכות")) headerMap!.credit = i;
        });
      }
      continue;
    }

    const dateRaw = cells[headerMap.date ?? 0]?.text ?? "";
    const desc = cells[headerMap.desc ?? 2]?.text ?? "";
    const debitRaw = cells[headerMap.debit ?? 4]?.text ?? "";
    const creditRaw = cells[headerMap.credit ?? 5]?.text ?? "";

    const booked = parseDateCell(dateRaw);
    const debit = parseAmountCell(debitRaw);
    const credit = parseAmountCell(creditRaw);
    const amt = debit && debit.amount > 0 ? debit : credit;
    if (!booked || !amt || !desc) continue;

    rowIdx++;
    transactions.push({
      booked_at: booked,
      amount: amt.amount,
      kind: debit && debit.amount > 0 ? "expense" : "income",
      description: desc,
      merchant: null,
      currency: "ILS",
      source_ref: hashTabularRef("leumi:xls", { d: booked, a: amt.amount, desc, i: rowIdx }),
      raw: { row: rowIdx, format: "leumi_html" },
    });
  }

  if (transactions.length === 0 && !headerMap) warnings.push("missing_required_columns");
  else if (transactions.length === 0) warnings.push("no_transactions_found");

  return {
    source: "leumi",
    accountLabel: "Leumi Account",
    accountMetadata: { format: "leumi_html_xls", parsed_rows: rowIdx },
    transactions,
    warnings,
  };
}

/** Leumi «תנועות בחשבון» HTML-as-XLS export. */
export async function parseLeumiXls(buffer: Buffer): Promise<ParseFileResult> {
  const html = buffer.toString("utf8");
  if (html.includes("<HTML") || html.includes("תנועות בחשבון")) {
    return parseLeumiHtmlTable(html);
  }

  const sheet = await readSheetMatrix(buffer);
  if (!sheet) {
    return { source: "leumi", accountLabel: "Leumi", accountMetadata: {}, transactions: [], warnings: ["empty_workbook"] };
  }

  const headerIdx = findHeaderRowIndex(sheet.rows, [["תאריך"], ["בחובה"], ["בזכות"]]);
  if (headerIdx < 0) {
    return {
      source: "leumi",
      accountLabel: "Leumi",
      accountMetadata: { format: "leumi_xls" },
      transactions: [],
      warnings: ["missing_required_columns"],
    };
  }

  const objects = rowsToObjects(sheet.rows, headerIdx);
  const transactions: ParseFileResult["transactions"] = [];
  const warnings: string[] = [];
  let errors = 0;

  objects.forEach((row, idx) => {
    const headers = Object.keys(row);
    const dateKey = headers.find((h) => normHeader(h).includes("תאריך") && !normHeader(h).includes("ערך"));
    const descKey = headers.find((h) => normHeader(h).includes("תיאור"));
    const debitKey = headers.find((h) => normHeader(h).includes("בחובה"));
    const creditKey = headers.find((h) => normHeader(h).includes("בזכות"));
    if (!dateKey) {
      errors++;
      return;
    }

    const booked = parseDateCell(row[dateKey] ?? "");
    const debit = debitKey ? parseAmountCell(row[debitKey] ?? "") : null;
    const credit = creditKey ? parseAmountCell(row[creditKey] ?? "") : null;
    const amt = debit && debit.amount > 0 ? debit : credit;
    const desc = descKey ? String(row[descKey] ?? "").trim() : "";
    if (!booked || !amt || !desc) {
      errors++;
      return;
    }

    transactions.push({
      booked_at: booked,
      amount: amt.amount,
      kind: debit && debit.amount > 0 ? "expense" : "income",
      description: desc,
      merchant: null,
      currency: "ILS",
      source_ref: hashTabularRef("leumi:xls", { d: booked, a: amt.amount, desc, i: idx }),
      raw: { row: idx + 1 },
    });
  });

  if (errors) warnings.push(`parse_errors:${errors}`);
  if (transactions.length === 0 && warnings.length === 0) warnings.push("no_transactions_found");

  return {
    source: "leumi",
    accountLabel: "Leumi Account",
    accountMetadata: { format: "leumi_xls", parsed_rows: objects.length },
    transactions,
    warnings,
  };
}

export async function parseBankSpreadsheet(input: {
  buffer: Buffer;
  filename: string;
  sourceHint?: FinanceImportSource | null;
}): Promise<ParseFileResult | null> {
  const detected = detectBankSpreadsheet(input.buffer, input.filename, input.sourceHint);
  if (detected === "cal") return parseCalXlsx(input.buffer);
  if (detected === "max") return parseMaxXlsx(input.buffer);
  if (detected === "leumi") return parseLeumiXls(input.buffer);
  return null;
}
