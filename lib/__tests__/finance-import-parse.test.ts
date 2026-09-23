import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unreverseRtlDateToken } from "../finance/import/rtl-date";
import { detectImportSource } from "../finance/import/detect-source";
import { parseCalStatementPdf } from "../finance/import/parse-cal-pdf";
import { parseLeumiIdentityPdf } from "../finance/import/parse-leumi-pdf";
import { parseCsvText } from "../finance/import/parse-tabular";
import { importSourceToTxnSource } from "../finance/import/source-map";

describe("unreverseRtlDateToken", () => {
  it("reverses Cal PDF date tokens", () => {
    assert.equal(unreverseRtlDateToken("6202/10/61"), "2026-01-16");
    assert.equal(unreverseRtlDateToken("5202/11/10"), "2025-11-01");
  });
});

describe("detectImportSource", () => {
  it("detects Cal and Leumi from headers", () => {
    assert.equal(detectImportSource("דף חיוב חודשי\nCal", "stmt.pdf"), "cal");
    assert.equal(detectImportSource("תעודת הזהות הבנקאית", "id.pdf"), "leumi");
    assert.equal(detectImportSource("date,amount", "export.csv"), "excel");
  });
});

describe("parseCalStatementPdf", () => {
  it("parses synthetic Cal statement lines", () => {
    const text = `
דף חיוב חודשי
2853755000-966-01
AMRAK ECAPSKROW*ELGOOG 6202/10/10
EU 16.20סה"כ לתאריך
344 5202/11/11
`;
    const result = parseCalStatementPdf(text);
    assert.equal(result.source, "cal");
    assert.ok(result.transactions.length >= 1);
    assert.ok(result.transactions.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.booked_at)));
    assert.ok(result.transactions.every((t) => t.amount > 0));
  });

  it("parses a redacted real Cal PDF fixture when present", async () => {
    const fixture = process.env.CAL_PDF_FIXTURE;
    if (!fixture) return;
    const { extractPdfText } = await import("../finance/import/pdf-text");
    const buf = readFileSync(fixture);
    const text = await extractPdfText(buf);
    const result = parseCalStatementPdf(text);
    assert.ok(result.transactions.length > 0, "expected transactions from Cal fixture");
  });
});

describe("parseLeumiIdentityPdf", () => {
  it("returns metadata without transactions", () => {
    const text = `
תעודת הזהות הבנקאית
נכונים ליום31/12/25
מס. לקוח10-669-55735
330-5573582
404.69ש"ח5,008.77
`;
    const result = parseLeumiIdentityPdf(text);
    assert.equal(result.transactions.length, 0);
    assert.equal(result.source, "leumi");
    assert.equal(result.accountMetadata.document_type, "leumi_bank_identity_annual");
    assert.ok(result.warnings.includes("leumi_annual_snapshot_only"));
  });
});

describe("parseCsvText", () => {
  it("maps Hebrew headers", () => {
    const csv = "תאריך,סכום,תיאור\n01/12/2025,120.50,סופר\n02/12/2025,-45,דלק\n";
    const result = parseCsvText(csv);
    assert.equal(result.transactions.length, 2);
    assert.equal(result.transactions[0].booked_at, "2025-12-01");
    assert.equal(result.transactions[0].kind, "income");
    assert.equal(result.transactions[1].kind, "expense");
  });
});

describe("importSourceToTxnSource", () => {
  it("maps cal to visa_cal", () => {
    assert.equal(importSourceToTxnSource("cal"), "visa_cal");
    assert.equal(importSourceToTxnSource("excel"), "excel");
  });
});
