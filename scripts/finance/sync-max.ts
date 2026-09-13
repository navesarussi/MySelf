/**
 * Sync MAX credit card transactions → MySelf finance ingest API.
 * Run locally or in GitHub Actions (see .github/workflows/max-finance-sync.yml).
 *
 * Env: MAX_USERNAME, MAX_PASSWORD, MYSELF_API_URL, FINANCE_INGEST_TOKEN, [MAX_CARD_NAME]
 */
import { CompanyTypes } from "@sergienko4/israeli-bank-scrapers";
import { syncProvider, requireEnv } from "./sync-provider";

async function main() {
  await syncProvider({
    companyId: CompanyTypes.Max,
    source: "max",
    username: requireEnv("MAX_USERNAME"),
    password: requireEnv("MAX_PASSWORD"),
    apiUrl: requireEnv("MYSELF_API_URL"),
    token: requireEnv("FINANCE_INGEST_TOKEN"),
    card_name: process.env.MAX_CARD_NAME?.trim() || "MAX",
    daysBack: 45,
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
