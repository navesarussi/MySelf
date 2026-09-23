import { createHash } from "crypto";
import type { ParsedImportTransaction } from "@/lib/finance/import/types";

export function normHeader(h: string): string {
  return h
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function pickColumn(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => ({ raw: h, norm: normHeader(h) }));
  for (const alias of aliases) {
    const needle = alias.toLowerCase();
    const hit = normalized.find((h) => h.norm === needle || h.norm.includes(needle));
    if (hit) return hit.raw;
  }
  return null;
}

export function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 60000) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + serial * 86400000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function parseDateCell(raw: string | number): string | null {
  if (typeof raw === "number") return excelSerialToISO(raw);
  const s = String(raw).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (dmyDash) {
    let year = dmyDash[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
  }

  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!dmy) return null;
  let year = dmy[3];
  if (year.length === 2) year = `20${year}`;
  return `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
}

export function parseAmountCell(raw: string | number): { amount: number; kind: "income" | "expense" } | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw === 0) return null;
    return { amount: Math.abs(raw), kind: raw < 0 ? "expense" : "income" };
  }
  const cleaned = raw.replace(/[₪$€,\s]/g, "").trim();
  if (!cleaned) return null;
  const negative = cleaned.startsWith("-") || cleaned.startsWith("(");
  const n = Number(cleaned.replace(/[()]/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return { amount: Math.abs(n), kind: negative ? "expense" : "income" };
}

export function parseCurrencyCell(raw: string): string {
  const s = raw.trim();
  if (/^\$|usd/i.test(s)) return "USD";
  if (/^€|eur/i.test(s)) return "EUR";
  if (/₪|ש"ח|ils/i.test(s)) return "ILS";
  return "ILS";
}

export function hashTabularRef(prefix: string, parts: Record<string, string | number>): string {
  const raw = Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
  return `${prefix}:${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

export function findHeaderRowIndex(rows: unknown[][], requiredAliases: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const headers = (rows[i] ?? []).map((c) => String(c ?? ""));
    const norms = headers.map(normHeader).filter(Boolean);
    if (norms.length < 2) continue;
    const allFound = requiredAliases.every((group) =>
      group.some((alias) => norms.some((h) => h.includes(alias.toLowerCase())))
    );
    if (allFound) return i;
  }
  return -1;
}

export function rowsToObjects(rows: unknown[][], headerRowIndex: number): Record<string, string | number>[] {
  const headerCells = (rows[headerRowIndex] ?? []).map((c) => String(c ?? "").replace(/[\r\n]+/g, " ").trim());
  const objects: Record<string, string | number>[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    if (cells.every((c) => String(c ?? "").trim() === "")) continue;
    const row: Record<string, string | number> = {};
    headerCells.forEach((h, idx) => {
      if (!h) return;
      const val = cells[idx];
      row[h] = typeof val === "number" ? val : String(val ?? "").trim();
    });
    objects.push(row);
  }
  return objects;
}

export function mapTabularRows(input: {
  objects: Record<string, string | number>[];
  dateAliases: string[];
  amountAliases: string[];
  descAliases: string[];
  merchantAliases: string[];
  refPrefix: string;
  defaultKind?: "expense";
  currencyCol?: string | null;
  installmentCols?: { index?: string | null; total?: string | null };
}): { transactions: ParsedImportTransaction[]; warnings: string[]; headers: string[] } {
  const warnings: string[] = [];
  if (input.objects.length === 0) return { transactions: [], warnings: ["empty_file"], headers: [] };

  const headers = Object.keys(input.objects[0] ?? {});
  const dateCol = pickColumn(headers, input.dateAliases);
  const amountCol = pickColumn(headers, input.amountAliases);
  const descCol = pickColumn(headers, input.descAliases);
  const merchantCol = pickColumn(headers, input.merchantAliases);

  if (!dateCol || !amountCol) {
    return { transactions: [], warnings: ["missing_required_columns"], headers };
  }

  const transactions: ParsedImportTransaction[] = [];
  let errors = 0;

  input.objects.forEach((row, idx) => {
    const booked = parseDateCell(row[dateCol] ?? "");
    const amt = parseAmountCell(row[amountCol] ?? "");
    if (!booked || !amt) {
      errors++;
      return;
    }
    const merchant = merchantCol ? String(row[merchantCol] ?? "").trim() || null : null;
    const description = (descCol ? String(row[descCol] ?? "").trim() : "") || merchant || "Import";
    const currency = input.currencyCol ? parseCurrencyCell(String(row[input.currencyCol] ?? "")) : "ILS";

    let installment_index: number | null = null;
    let installment_total: number | null = null;
    if (input.installmentCols?.index) {
      const v = Number(String(row[input.installmentCols.index] ?? "").replace(/\D/g, ""));
      if (v >= 1) installment_index = v;
    }
    if (input.installmentCols?.total) {
      const v = Number(String(row[input.installmentCols.total] ?? "").replace(/\D/g, ""));
      if (v >= 1) installment_total = v;
    }

    transactions.push({
      booked_at: booked,
      amount: amt.amount,
      kind: input.defaultKind ?? amt.kind,
      description,
      merchant,
      currency,
      installment_index,
      installment_total,
      installment_label:
        installment_index && installment_total ? `${installment_index} מתוך ${installment_total}` : null,
      source_ref: hashTabularRef(input.refPrefix, {
        d: booked,
        a: amt.amount,
        m: merchant ?? description,
        i: idx,
      }),
      raw: { row: idx + 1 },
    });
  });

  if (errors) warnings.push(`parse_errors:${errors}`);
  return { transactions, warnings, headers };
}
