/**
 * Sync Bank Leumi transactions → MySelf finance ingest API.
 * Run locally or in GitHub Actions (see .github/workflows/leumi-finance-sync.yml).
 *
 * Env: LEUMI_USERNAME, LEUMI_PASSWORD, MYSELF_API_URL, FINANCE_INGEST_TOKEN
 */
import { CompanyTypes, createScraper } from "@sergienko4/israeli-bank-scrapers";

type ScraperTxn = {
  date: string;
  description?: string;
  chargedAmount?: number;
  originalAmount?: number;
  identifier?: string | number;
  memo?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

function txnDate(raw: string): string {
  const d = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`invalid_date:${raw}`);
  return d;
}

function mapTxn(accountNumber: string, txn: ScraperTxn) {
  const amountRaw = txn.chargedAmount ?? txn.originalAmount ?? 0;
  const signed = Number(amountRaw);
  if (!Number.isFinite(signed) || signed === 0) return null;
  const kind = signed > 0 ? "income" : "expense";
  const description = (txn.description ?? txn.memo ?? "").trim() || "תנועה";
  return {
    source: "leumi" as const,
    txn_date: txnDate(txn.date),
    amount: Math.abs(signed),
    kind,
    description,
    merchant: description,
    account_number: accountNumber,
    identifier: txn.identifier,
  };
}

async function postIngest(
  apiUrl: string,
  token: string,
  transactions: ReturnType<typeof mapTxn>[]
) {
  const payload = transactions.filter((t): t is NonNullable<typeof t> => t != null);
  if (payload.length === 0) {
    console.log("No transactions to ingest.");
    return;
  }

  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/v1/finance/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transactions: payload }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = typeof body === "object" && body && "error" in body ? String(body.error) : res.status;
    throw new Error(`ingest_failed:${err}`);
  }
  console.log(JSON.stringify(body));
}

async function main() {
  const username = requireEnv("LEUMI_USERNAME");
  const password = requireEnv("LEUMI_PASSWORD");
  const apiUrl = requireEnv("MYSELF_API_URL");
  const token = requireEnv("FINANCE_INGEST_TOKEN");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 45);

  const scraper = createScraper({
    companyId: CompanyTypes.Leumi,
    startDate,
    defaultTimeout: 120_000,
    navigationRetryCount: 2,
  });

  const result = await scraper.scrape({ username, password });
  if (!result.success) {
    throw new Error(result.errorMessage ?? result.errorType ?? "scrape_failed");
  }

  const mapped: ReturnType<typeof mapTxn>[] = [];
  for (const account of result.accounts ?? []) {
    for (const txn of account.txns as ScraperTxn[]) {
      const row = mapTxn(String(account.accountNumber), txn);
      if (row) mapped.push(row);
    }
  }

  console.log(`Scraped ${mapped.length} transactions from Leumi.`);
  await postIngest(apiUrl, token, mapped);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
