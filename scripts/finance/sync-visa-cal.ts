/**
 * Sync Visa Cal credit card transactions → MySelf finance ingest API.
 * Run locally or in GitHub Actions (see .github/workflows/cal-finance-sync.yml).
 *
 * Env: CAL_USERNAME, CAL_PASSWORD, MYSELF_API_URL, FINANCE_INGEST_TOKEN, [CAL_CARD_NAME]
 */
import { CompanyTypes } from "@sergienko4/israeli-bank-scrapers";
import { syncProvider, requireEnv } from "./sync-provider";

async function main() {
  await syncProvider({
    companyId: CompanyTypes.VisaCal,
    source: "visa_cal",
    username: requireEnv("CAL_USERNAME"),
    password: requireEnv("CAL_PASSWORD"),
    apiUrl: requireEnv("MYSELF_API_URL"),
    token: requireEnv("FINANCE_INGEST_TOKEN"),
    card_name: process.env.CAL_CARD_NAME?.trim() || "Cal",
    daysBack: 45,
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
