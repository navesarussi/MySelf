import { detectImportSource } from "@/lib/finance/import/detect-source";
import { parseCalStatementPdf } from "@/lib/finance/import/parse-cal-pdf";
import { parseLeumiIdentityPdf } from "@/lib/finance/import/parse-leumi-pdf";
import { parseCsvText, parseXlsxBuffer } from "@/lib/finance/import/parse-tabular";
import { extractPdfText } from "@/lib/finance/import/pdf-text";
import type { FinanceImportSource, ParseFileResult } from "@/lib/finance/import/types";

function ext(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export async function parseImportFile(input: {
  filename: string;
  buffer: Buffer;
  mime?: string | null;
  sourceHint?: FinanceImportSource | null;
}): Promise<ParseFileResult> {
  const extension = ext(input.filename);
  let text = "";

  if (extension === "pdf" || input.mime === "application/pdf") {
    text = await extractPdfText(input.buffer);
    const detected = detectImportSource(text, input.filename, input.sourceHint);
    if (detected === "leumi" || /תעודת הזהות הבנקאית/.test(text)) {
      return parseLeumiIdentityPdf(text);
    }
    if (detected === "cal" || /דף חיוב חודשי|cal-online|pay\s*box/i.test(text)) {
      return parseCalStatementPdf(text);
    }
    return {
      source: detected,
      accountLabel: "PDF import",
      accountMetadata: { unparsed_pdf: true, preview: text.slice(0, 200) },
      transactions: [],
      warnings: ["unsupported_pdf_format"],
    };
  }

  if (extension === "csv" || extension === "txt" || input.mime === "text/csv") {
    text = input.buffer.toString("utf8");
    const result = parseCsvText(text);
    result.source = input.sourceHint ?? "excel";
    return result;
  }

  if (extension === "xlsx" || extension === "xls") {
    const result = await parseXlsxBuffer(input.buffer);
    result.source = input.sourceHint ?? "excel";
    return result;
  }

  return {
    source: input.sourceHint ?? "manual",
    accountLabel: input.filename,
    accountMetadata: {},
    transactions: [],
    warnings: ["unsupported_file_type"],
  };
}
