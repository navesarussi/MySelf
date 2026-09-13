/**
 * Sync Bank Leumi transactions → MySelf finance ingest API.
 * Run locally or in GitHub Actions (see .github/workflows/leumi-finance-sync.yml).
 *
 * Env: LEUMI_USERNAME, LEUMI_PASSWORD, MYSELF_API_URL, FINANCE_INGEST_TOKEN
 */
import { CompanyTypes } from "@sergienko4/israeli-bank-scrapers";
import { syncProvider, requireEnv } from "./sync-provider";

async function main() {
  await syncProvider({
    companyId: CompanyTypes.Leumi,
    source: "leumi",
    username: requireEnv("LEUMI_USERNAME"),
    password: requireEnv("LEUMI_PASSWORD"),
    apiUrl: requireEnv("MYSELF_API_URL"),
    token: requireEnv("FINANCE_INGEST_TOKEN"),
    daysBack: 45,
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
