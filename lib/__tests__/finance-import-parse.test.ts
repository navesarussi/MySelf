import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unreverseRtlDateToken } from "../finance/import/rtl-date";
import { detectImportSource } from "../finance/import/detect-source";
import { parseCalStatementPdf } from "../finance/import/parse-cal-pdf";
import { parseLeumiIdentityPdf } from "../finance/import/parse-leumi-pdf";
import { parseCsvText } from "../finance/import/parse-tabular";
import { importSourceToTxnSource } from "../finance/import/source-map";
import { formatInstallmentLabel, parseInstallmentLabel } from "../finance/import/installment-label";
import {
  compactImportText,
  extractCalInstallment,
  extractCalMerchantFromTail,
  isSummaryImportText,
  normalizeHebrewDescription,
} from "../finance/import/normalize-import-row";

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

describe("installment helpers", () => {
  it("formats and parses Hebrew installment labels", () => {
    assert.equal(formatInstallmentLabel(2, 7), "2 מתוך 7");
    assert.deepEqual(parseInstallmentLabel("1 מתוך 6"), { index: 1, total: 6 });
  });
});

describe("normalize-import-row", () => {
  it("detects summary/total rows", () => {
    assert.equal(isSummaryImportText('סה"כ לתאריך 01/11/25'), true);
    assert.equal(isSummaryImportText('16.20סה"כ לתאריך'), true);
    assert.equal(isSummaryImportText(compactImportText('סה"כלתאריך')), true);
    assert.equal(isSummaryImportText("344 5202/11/11"), false);
    assert.equal(isSummaryImportText("סופר-פאר"), false);
  });

  it("normalizes glued Hebrew merchant text", () => {
    assert.equal(normalizeHebrewDescription("לאאירלנדמוצריאון"), "לא אירלנד מוצרי און");
    assert.equal(normalizeHebrewDescription("סופר-פאר"), "סופר-פאר");
  });

  it("prefers Hebrew merchant over terminal-prefixed Apple Pay Latin token", () => {
    const { merchant } = extractCalMerchantFromTail("1234ApplePay לא אירלנד מוצרי און LLIB/MOC.ELPPA");
    assert.match(merchant, /מוצרי און/);
    assert.doesNotMatch(merchant, /1234/);
    assert.doesNotMatch(merchant, /ApplePay/i);
  });

  it("keeps Latin merchant when PayBox label is present", () => {
    const { merchant } = extractCalMerchantFromTail("מזהה כרטיס 1234ApplePay MOC.REGNITSOH");
    assert.match(merchant, /HOSTINGER/i);
    assert.doesNotMatch(merchant, /מזהה/);
  });

  it("strips glued category prefix from merchant tails", () => {
    const { merchant } = extractCalMerchantFromTail("מסעדותקפהג׳ו");
    assert.match(merchant, /קפה/);
    assert.doesNotMatch(merchant, /^מסעדות/);
  });

  it("sets installments only for explicit Cal markers", () => {
    const real = extractCalInstallment("₪ 49.90 ₪ 49.90 2 מתוך 7");
    assert.deepEqual(real, { index: 2, total: 7, label: "2 מתוך 7" });

    const pipe = extractCalInstallment("LLIB/MOC.ELPPA 6|2|0|2/1|0/7|2");
    assert.deepEqual(pipe, { index: 2, total: 7, label: "2 מתוך 7" });

    const falsePositive = extractCalInstallment("5|2|0|2/1|1/6|2", { billingAmount: 120, txnAmount: 120 });
    assert.deepEqual(falsePositive, { index: null, total: null, label: null });

    const splitBilling = extractCalInstallment("5|2|0|2/1|1/6|2", { billingAmount: 823, txnAmount: 4118 });
    assert.deepEqual(splitBilling, { index: 2, total: 6, label: "2 מתוך 6" });
  });
});

describe("parseCalStatementPdf", () => {
  it("parses split-line merchant + amount rows but skips date totals", () => {
    const text = `
דף חיוב חודשי
2853755000-966-01
AMRAK ECAPSKROW*ELGOOG 6202/10/10
120 6202/10/10
EU 16.20סה"כ לתאריך
344 5202/11/11
`;
    const result = parseCalStatementPdf(text);
    assert.equal(result.source, "cal");
    assert.equal(result.transactions.length, 1);
    assert.match(result.transactions[0].merchant ?? "", /GOOG/i);
    assert.equal(result.transactions[0].amount, 120);
    assert.ok(result.transactions.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.booked_at)));
  });

  it("extracts Hebrew merchant, currency, and installments from tab-style ILS rows", () => {
    const text = `
דף חיוב חודשי
₪ 49.90 ₪ 49.90 לא אירלנד מוצרי און LLIB/MOC.ELPPA 6|2|0|2/1|0/7|2
₪ 120.00 ₪ 120.00 סופר-פאר 5|2|0|2/1|1/6|2
₪ 823.00 ₪ 4,118.00 לא סופר-פאר 5|2|0|2/1|1/6|2
`;
    const result = parseCalStatementPdf(text);
    const apple = result.transactions.find((t) => (t.merchant ?? "").includes("מוצרי און"));
    assert.ok(apple, "expected Hebrew Apple merchant");
    assert.equal(apple?.currency, "ILS");
    assert.equal(apple?.installment_index, 2);
    assert.equal(apple?.installment_total, 7);
    assert.equal(apple?.installment_label, "2 מתוך 7");

    const regular = result.transactions.find((t) => (t.merchant ?? "").includes("סופר") && t.amount === 120);
    assert.ok(regular, "expected regular super-pharm row");
    assert.equal(regular?.installment_index, null);
    assert.equal(regular?.installment_total, null);

    const installment = result.transactions.find((t) => t.amount === 823);
    assert.ok(installment, "expected split-billing installment row");
    assert.equal(installment?.installment_index, 2);
    assert.equal(installment?.installment_total, 6);
  });

  it("skips summary rows in tabular-style Cal lines", () => {
    const text = `
דף חיוב חודשי
₪ 1,300.00 ₪ 1,300.00 סה"כ לתאריך 5202/11/10
`;
    const result = parseCalStatementPdf(text);
    assert.equal(result.transactions.length, 0);
  });

  it("parses USD merchant rows and skips glued subtotal lines", () => {
    const text = `
דף חיוב חודשי
2853755000-966-01
$ 20.00 RAILWAY.APP
$ 5.00 CLAUDE.AI SUBSCR
$ 1.00 FOREIGN TX FEE
$ 26.00 סה"כ לתאריך 01/10/25
₪ 95.30 ₪ 95.30 סופר-פאר 5202/11/01
`;
    const result = parseCalStatementPdf(text);
    const usd = result.transactions.filter((t) => t.currency === "USD");
    assert.equal(usd.length, 3);
    assert.ok(usd.some((t) => /railway/i.test(t.merchant ?? "")));
    assert.ok(usd.some((t) => /claude/i.test(t.merchant ?? "")));
    assert.ok(usd.every((t) => t.booked_at === "2025-10-01"));
    assert.ok(result.transactions.every((t) => !/סה"כ/i.test(t.merchant ?? "")));
  });

  it("extracts Anthropic from latin-only merchant line", () => {
    const { merchant } = extractCalMerchantFromTail("CITROPAIC/HPA ANTHROPIC");
    assert.match(merchant, /anthropic/i, `got ${merchant}`);
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

  it("skips summary rows", () => {
    const csv = "תאריך,סכום,תיאור\n01/12/2025,120.50,סופר\n02/12/2025,1300,סה\"כ\n";
    const result = parseCsvText(csv);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0].description, "סופר");
  });
});

describe("importSourceToTxnSource", () => {
  it("maps cal to visa_cal", () => {
    assert.equal(importSourceToTxnSource("cal"), "visa_cal");
    assert.equal(importSourceToTxnSource("excel"), "excel");
  });
});
