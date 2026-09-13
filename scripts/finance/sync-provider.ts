/**
 * Generic scraper runner supporting Israeli bank & card providers.
 * Scrapes via @sergienko4/israeli-bank-scrapers and ingests into MySelf.
 */
import { CompanyTypes, createScraper } from "@sergienko4/israeli-bank-scrapers";
import { inferTxnKind } from "../../lib/finance/classify";
import type { FinanceIngestInput } from "../../lib/finance/types";
import type { FinanceSource } from "../../lib/finance/external-key";

export type ScraperTxn = {
  date: string;
  description?: string;
  chargedAmount?: number;
  originalAmount?: number;
  identifier?: string | number;
  memo?: string;
};

export type SyncProviderOptions = {
  companyId: CompanyTypes | string;
  source: FinanceSource;
  username: string;
  password: string;
  apiUrl: string;
  token: string;
  card_name?: string | null;
  account_number?: string | null;
  daysBack?: number;
  timeoutMs?: number;
};

export function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

export function formatScraperDate(raw: string): string {
  if (raw.includes("T")) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    }
  }
  const d = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error(`invalid_date:${raw}`);
  }
  return d;
}

export function resolveCompanyId(id: string): CompanyTypes {
  const norm = id.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (norm === "leumi") return CompanyTypes.Leumi;
  if (norm === "max") return CompanyTypes.Max;
  if (norm === "visacal" || norm === "cal") return CompanyTypes.VisaCal;
  const found = Object.values(CompanyTypes).find(
    (v) => v.toLowerCase() === id.toLowerCase() || v.toLowerCase() === norm
  );
  if (found) return found;
  return id as CompanyTypes;
}

export function mapScraperTxn(
  accountNumber: string,
  txn: ScraperTxn,
  options: Pick<SyncProviderOptions, "source" | "card_name">
): FinanceIngestInput | null {
  const amountRaw = txn.chargedAmount ?? txn.originalAmount ?? 0;
  const signed = Number(amountRaw);
  if (!Number.isFinite(signed) || signed === 0) return null;
  const description = (txn.description ?? txn.memo ?? "").trim() || "תנועה";
  const kind = inferTxnKind({
    signedAmount: signed,
    description,
  });
  return {
    source: options.source,
    txn_date: formatScraperDate(txn.date),
    amount: Math.abs(signed),
    kind,
    description,
    merchant: description,
    account_number: accountNumber || null,
    card_name: options.card_name ?? null,
    identifier: txn.identifier != null ? String(txn.identifier) : null,
  };
}

export async function postIngest(
  apiUrl: string,
  token: string,
  transactions: FinanceIngestInput[]
): Promise<void> {
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

export async function syncProvider(options: SyncProviderOptions): Promise<void> {
  const companyId = resolveCompanyId(String(options.companyId));
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (options.daysBack ?? 45));

  const scraper = createScraper({
    companyId,
    startDate,
    defaultTimeout: options.timeoutMs ?? 120_000,
    navigationRetryCount: 2,
  });

  console.log(`Starting scrape for ${companyId} (${options.source})...`);
  const result = await scraper.scrape({
    username: options.username,
    password: options.password,
  });

  if (!result.success) {
    throw new Error(result.errorMessage ?? result.errorType ?? "scrape_failed");
  }

  const mapped: FinanceIngestInput[] = [];
  for (const account of result.accounts ?? []) {
    const acctNum = String(account.accountNumber || options.account_number || "");
    for (const txn of (account.txns as ScraperTxn[]) ?? []) {
      const row = mapScraperTxn(acctNum, txn, options);
      if (row) mapped.push(row);
    }
  }

  console.log(`Scraped ${mapped.length} transactions from ${companyId} (${options.source}).`);
  await postIngest(options.apiUrl, options.token, mapped);
}
