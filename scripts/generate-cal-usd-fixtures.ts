import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

function rtlDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const rev = (s: string) => s.split("").reverse().join("");
  return `${rev(y)}/${rev(m)}/${rev(d)}`;
}

function revMerchant(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.split("").reverse().join(""))
    .join(" ");
}

function merchantLatin(raw: string): string {
  const base = raw.replace(/\([^)]*\)/g, "").replace(/\s*refund\s*/i, "").trim();
  if (/hostinger/i.test(base)) return "moc.regnitsoh";
  if (/^google play/i.test(base)) return revMerchant("GOOGLE PLAY");
  if (/^apple/i.test(base)) return revMerchant("APPLE.COM/US");
  if (/^anthropic/i.test(base)) return revMerchant("ANTHROPIC*CLAUDE SUB");
  if (/^cursor usage/i.test(base)) return revMerchant("CURSOR USAGE SEP");
  if (/^cursor/i.test(base)) return revMerchant("CURSOR, AI POWERED IDE");
  if (/^railway/i.test(base)) return "YAWLIAR";
  if (/^replit/i.test(base)) return revMerchant("REPLIT, INC.");
  if (/^claude/i.test(base)) return revMerchant("CLAUDE.AI SUBSCRIPTION");
  if (/^etihad/i.test(base)) return revMerchant("ETIHAD AIR");
  if (/^origin/i.test(base)) return revMerchant("ORIGIN INSTITUTE");
  if (/^dept of home/i.test(base)) return revMerchant("DEPT OF HOME AFFAIRS");
  if (/^hostinger/i.test(base)) return revMerchant("HOSTINGER");
  return revMerchant(base.split(/[^A-Za-z0-9*.,/\\-\s]/)[0] ?? base);
}

type TruthRow = {
  statement: string;
  txn_date: string;
  charge_date: string;
  usd: string;
  merchant_from_pdf: string;
};

function parseCsv(path: string): TruthRow[] {
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/).slice(1);
  return lines.map((line) => {
    const cols = line.split(",");
    return {
      statement: cols[0],
      txn_date: cols[1],
      charge_date: cols[2],
      usd: cols[3],
      merchant_from_pdf: cols[4]?.replace(/^"|"$/g, "") ?? "",
    };
  });
}

function buildFixture(row: TruthRow) {
  const usd = Number(row.usd);
  if (!Number.isFinite(usd) || row.txn_date === "-") {
    return {
      id: `${row.statement}-fx-fee-skip`,
      text: `דף חיוב חודשי\n$ ${Math.abs(usd).toFixed(2)} עמלת עסקה במט"ח - לידיעה בלבד ${rtlDate(row.charge_date !== "-" ? row.charge_date : "2026-06-24")}`,
      expectSkip: true,
    };
  }

  const signed = usd < 0 ? "-" : "";
  const amount = Math.abs(usd);
  const latin = merchantLatin(row.merchant_from_pdf);
  const tail = /refund/i.test(row.merchant_from_pdf)
    ? "לא זיכוי"
    : /hostinger|cyprus/i.test(row.merchant_from_pdf)
      ? "לא קפריסין"
      : /etihad|tourism/i.test(row.merchant_from_pdf)
        ? "לא ישראל תיירות"
        : /australia|dept of home|origin/i.test(row.merchant_from_pdf)
          ? "לא אוסטרליה"
          : /lithuania|onlychain/i.test(row.merchant_from_pdf)
            ? "לא ליטואניהשונות"
            : /japan|f25store/i.test(row.merchant_from_pdf)
              ? "לא יפאןשונות"
              : /google|apple/i.test(row.merchant_from_pdf)
                ? "לא ארצות הברית מוצרי און"
                : /selectmedia|replit|claude|computer/i.test(row.merchant_from_pdf)
                  ? "לא ארצות הברית מחשבים"
                  : "ארצות הברית";

  const text = [
    "דף חיוב חודשי",
    "2853755000-966-01",
    latin,
    `$ ${signed}${amount.toFixed(2)} ${tail} ${rtlDate(row.txn_date)} ${rtlDate(row.charge_date)}`,
  ].join("\n");

  const merchantNeedle = row.merchant_from_pdf.replace(/\([^)]*\)/g, "").replace(/refund/i, "").trim().split(/[^A-Za-z0-9*.,/\\-\s]/)[0]?.split(/\s+/)[0] ?? "MERCHANT";

  return {
    id: `${row.statement}-${merchantNeedle.toLowerCase().slice(0, 12)}`,
    text,
    expect: {
      date: row.txn_date,
      original_amount: amount,
      merchant: merchantNeedle.toUpperCase(),
      kind: usd < 0 ? "income" : "expense",
    },
  };
}

const csvPath =
  process.env.TRUTH_CSV ??
  "/home/ubuntu/.cursor/projects/workspace/uploads/myself-recover-usd-truth-2026-09-26_e585.csv";
const rows = parseCsv(csvPath);
const fixtures = [
  ...rows.map(buildFixture),
  {
    id: "cal-25-05-multiline-transfer",
    text: `דף חיוב חודשי\nxoByaP\n₪ 700.00 ₪ 700.00 העברה ל\nציפי שפיננסים ${rtlDate("2025-04-27")}`,
    expectIls: { date: "2025-04-27", amount: 700, merchant: "ציפי", kind: "expense" },
  },
];

writeFileSync(
  join(process.cwd(), "lib/__tests__/fixtures/cal-usd-truth-fixtures.json"),
  JSON.stringify(fixtures, null, 2)
);
console.log(`wrote ${fixtures.length} fixtures from ${rows.length} truth rows`);
