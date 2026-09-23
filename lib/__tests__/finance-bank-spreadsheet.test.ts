import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCalXlsx, parseLeumiXls, parseMaxXlsx } from "../finance/import/parse-bank-spreadsheet";
import { extractPdfText, resetPdfTextRuntimeForTests } from "../finance/import/pdf-text";
import { parseCalStatementPdf } from "../finance/import/parse-cal-pdf";
import { excelSerialToISO, parseDateCell } from "../finance/import/spreadsheet-utils";

describe("spreadsheet-utils", () => {
  it("converts Excel serial dates", () => {
    assert.equal(excelSerialToISO(46286), "2026-09-21");
    assert.equal(parseDateCell("28-06-2026"), "2026-06-28");
  });
});

describe("parseCalXlsx", () => {
  it("parses redacted Cal export headers with serial dates", async () => {
    const XLSX = await import("xlsx");
    const rows = [
      ["פירוט עסקאות ללקוח לחשבון לאומי כאל"],
      ["תאריך\r\nעסקה", "שם בית עסק", 'סכום\r\nבש"ח', "סכום\r\nבדולר", "מועד\r\nחיוב", "סוג\r\nעסקה"],
      [46286, "חנות א", 120.5, "", 46297, "רגילה"],
      [46285, "חנות ב", 66.95, "", 46297, "הוראת קבע"],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = await parseCalXlsx(buffer);
    assert.equal(result.source, "cal");
    assert.equal(result.transactions.length, 2);
    assert.equal(result.transactions[0].booked_at, "2026-09-21");
    assert.equal(result.transactions[0].merchant, "חנות א");
    assert.equal(result.transactions[0].kind, "expense");
    assert.ok(result.transactions.every((t) => t.source_ref.startsWith("cal:xlsx:")));
  });

  it("falls back to USD amount column when ILS cell is empty", async () => {
    const XLSX = await import("xlsx");
    const rows = [
      ["פירוט עסקאות"],
      ["תאריך\r\nעסקה", "שם בית עסק", 'סכום\r\nבש"ח', "סכום\r\nבדולר", "מועד\r\nחיוב", "סוג\r\nעסקה"],
      [46286, "FOREIGN SHOP", "", 20, 46297, "רגילה"],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = await parseCalXlsx(buffer);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0].currency, "USD");
    assert.equal(result.transactions[0].amount, 20);
  });
});

describe("parseMaxXlsx", () => {
  it("parses redacted Max transaction-details export", async () => {
    const XLSX = await import("xlsx");
    const rows = [
      ["כל המשתמשים (1)"],
      ["כל הכרטיסים (1)"],
      ["07/2026"],
      ["תאריך עסקה", "שם בית העסק", "קטגוריה", "סוג עסקה", "סכום חיוב", "מטבע חיוב", "סכום עסקה מקורי", "מטבע עסקה מקורי"],
      ["28-06-2026", "SHOP NAME", "שונות", "חיוב", 25.57, "₪", 8.5, "$"],
      ["01-07-2026", "CAFE NAME", "מזון", "חיוב", 42, "₪", 42, "₪"],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const result = await parseMaxXlsx(buffer);
    assert.equal(result.source, "max");
    assert.equal(result.transactions.length, 2);
    assert.equal(result.transactions[0].booked_at, "2026-06-28");
    assert.equal(result.transactions[0].merchant, "SHOP NAME");
    assert.equal(result.transactions[0].currency, "ILS");
    assert.equal(result.transactions[1].amount, 42);
  });
});

describe("parseLeumiXls", () => {
  it("parses redacted Leumi HTML account movements table", async () => {
    const html = `<html><body><table><tr><td class='xlTableTitle'>תנועות בחשבון</td></tr>
<tr><td class="xlHeader"><span>תאריך</span></td><td class="xlHeader"><span>תאריך ערך</span></td>
<td class="xlHeader"><span>תיאור</span></td><td class="xlHeader"><span>אסמכתא</span></td>
<td class="xlHeader"><span>בחובה</span></td><td class="xlHeader"><span>בזכות</span></td></tr>
<tr><td class="xlFull-date">15/03/2026</td><td class="xlFull-date">15/03/2026</td>
<td class="xlCell">משיכת מזומן</td><td class="xlCell">123</td>
<td class="xlformatNumber">100.00</td><td class="xlformatNumber">0.00</td></tr>
<tr><td class="xlFull-date">20/03/2026</td><td class="xlFull-date">20/03/2026</td>
<td class="xlCell">העברה נכנסת</td><td class="xlCell">456</td>
<td class="xlformatNumber">0.00</td><td class="xlformatNumber">500.00</td></tr>
</table></body></html>`;
    const result = await parseLeumiXls(Buffer.from(html, "utf8"));
    assert.equal(result.source, "leumi");
    assert.equal(result.transactions.length, 2);
    assert.equal(result.transactions[0].kind, "expense");
    assert.equal(result.transactions[0].amount, 100);
    assert.equal(result.transactions[1].kind, "income");
    assert.equal(result.transactions[1].amount, 500);
  });
});

describe("pdf-text serverless smoke", () => {
  it("extractPdfText does not throw without DOMMatrix or pdfjs worker globals", async () => {
    const savedDom = (globalThis as { DOMMatrix?: unknown }).DOMMatrix;
    delete (globalThis as { DOMMatrix?: unknown }).DOMMatrix;
    resetPdfTextRuntimeForTests();

    const minimalPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\nxref\n0 1\ntrailer<</Root 1 0 R>>\nstartxref\n0\n%%EOF"
    );

    try {
      const text = await extractPdfText(minimalPdf);
      assert.equal(typeof text, "string");
      assert.ok((globalThis as { pdfjsWorker?: { WorkerMessageHandler?: unknown } }).pdfjsWorker?.WorkerMessageHandler);
    } finally {
      if (savedDom) (globalThis as { DOMMatrix?: unknown }).DOMMatrix = savedDom;
    }
  });
});

describe("parseCalStatementPdf tab-split dates", () => {
  it("parses real-format ILS rows with tab-split RTL dates and Hebrew merchants", () => {
    const text = `
דף חיוב חודשי
₪ 228.85 ₪ 228.85 לא הורא\tת\tקבע גז א\tל\tק\tט\tר\tה\tפ\tאוור 6\t2\t0\t2/7\t0/1\t3
₪ 82.50 ₪ 82.50 לא תיירות סנט\tר\tל\tפ\tא\tר\tק\tב\tע"מ\t-
6\t2\t0\t2/8\t0/8\t2
`;
    const result = parseCalStatementPdf(text);
    assert.ok(result.transactions.length >= 2);
    const gas = result.transactions.find((t) => (t.merchant ?? "").includes("גז"));
    assert.ok(gas, "expected gas merchant");
    assert.equal(gas?.installment_index, 2);
    assert.equal(gas?.installment_total, 7);
    const park = result.transactions.find((t) => (t.merchant ?? "").includes("פארק"));
    assert.ok(park, "expected park merchant from multi-line row");
  });
});
