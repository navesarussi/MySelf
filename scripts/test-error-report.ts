/**
 * Send a test error report through the server pipeline.
 *
 * Usage:
 *   ERROR_WEBHOOK_URL=... ERROR_WEBHOOK_KEY=... tsx scripts/test-error-report.ts
 *
 * Or rely on myself.system_config rows:
 *   error_webhook_url, error_webhook_key
 */
import { reportErrorAsync } from "../lib/error-reporting";

async function main() {
  await reportErrorAsync({
    source: "server",
    error: new Error("error_reporting_test_script"),
    context: {
      test: true,
      userAction: "scripts/test-error-report.ts",
      route: "/scripts/test-error-report",
    },
  });
  console.log("test error report queued/sent (fire-and-forget complete)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
