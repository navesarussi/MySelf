import { readFileSync } from "fs";
import { parseCalStatementPdf } from "../lib/finance/import/parse-cal-pdf";
import { normalizeParsedForeignAmounts } from "../lib/finance/import/foreign-amount";

const csv = readFileSync(
  process.env.TRUTH_CSV ??
    "/home/ubuntu/.cursor/projects/workspace/uploads/myself-recover-usd-truth-2026-09-26_e585.csv",
  "utf8"
)
  .trim()
  .split(/\n/)
  .slice(1);
const fixtures = JSON.parse(
  readFileSync("lib/__tests__/fixtures/cal-usd-truth-fixtures.json", "utf8")
);

function matchMerchant(a: string, e: string): boolean {
  const x = (a ?? "").toUpperCase();
  const y = e.toUpperCase().replace(/[^A-Z0-9]/g, " ").split(/\s+/)[0];
  return x.includes(y) || y.includes(x.replace(/[^A-Z0-9]/g, "").slice(0, 4));
}

console.log("| # | Statement | Truth date | Truth USD | Truth merchant | Parsed date | Parsed USD | Parsed merchant | Match |");
console.log("|---|-----------|------------|-----------|----------------|-------------|------------|-----------------|-------|");

let i = 0;
for (const line of csv) {
  const cols = line.split(",");
  const stmt = cols[0];
  const txnDate = cols[1];
  const usd = cols[3];
  const merch = cols[4]?.replace(/^"|"$/g, "") ?? "";

  if (txnDate === "-") {
    const fx = fixtures.find((f: { expectSkip?: boolean }) => f.expectSkip);
    const rows = parseCalStatementPdf(fx.text).transactions.filter((t) => t.currency === "USD");
    console.log(
      `| ${++i} | ${stmt} | (info) | ${usd} | FX fee skip | — | — | — | ${rows.length === 0 ? "✓" : "✗"} |`
    );
    continue;
  }

  const fx = fixtures.find(
    (f: { expect?: { date: string; original_amount: number } }) =>
      f.expect?.date === txnDate &&
      Math.abs((f.expect?.original_amount ?? 0) - Math.abs(Number(usd))) < 0.01
  );
  const parsed = normalizeParsedForeignAmounts(
    parseCalStatementPdf(fx.text).transactions.filter((t) => t.currency === "USD")
  );
  const p = parsed[0];
  const ok =
    p &&
    p.booked_at === txnDate &&
    Math.abs((p.original_amount ?? 0) - Math.abs(Number(usd))) < 0.01 &&
    matchMerchant(p.merchant ?? "", merch) &&
    (Number(usd) < 0 ? "income" : "expense") === p.kind;
  console.log(
    `| ${++i} | ${stmt} | ${txnDate} | ${usd} | ${merch.slice(0, 24)} | ${p?.booked_at ?? "—"} | ${p?.original_amount ?? "—"} | ${(p?.merchant ?? "—").slice(0, 20)} | ${ok ? "✓" : "✗"} |`
  );
}
