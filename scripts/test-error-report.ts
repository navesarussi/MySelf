/**
 * Send a test error report through the server pipeline.
 *
 * Usage (env or DB config for webhook):
 *   ERROR_WEBHOOK_URL=... ERROR_WEBHOOK_KEY=... tsx scripts/test-error-report.ts
 *
 * Usage (live endpoint, no session — uses configured webhook key as header):
 *   ERROR_WEBHOOK_KEY=... API_URL=https://myselfapp.xyz tsx scripts/test-error-report.ts --http
 */
import { reportErrorAsync } from "../lib/error-reporting";

async function sendViaPipeline() {
  await reportErrorAsync({
    source: "server",
    error: new Error("error_reporting_test_script"),
    context: {
      test: true,
      userAction: "scripts/test-error-report.ts",
      route: "/scripts/test-error-report",
    },
  });
  console.log("test error report queued/sent via server pipeline");
}

async function sendViaHttp() {
  const apiUrl = (process.env.API_URL ?? "https://myselfapp.xyz").replace(/\/+$/, "");
  const key = process.env.ERROR_WEBHOOK_KEY?.trim();
  if (!key) throw new Error("ERROR_WEBHOOK_KEY required for --http");

  const res = await fetch(`${apiUrl}/api/v1/client-errors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-maintainer-test": key,
    },
    body: JSON.stringify({ test: true }),
  });
  const body = await res.text();
  console.log(`HTTP ${res.status}: ${body}`);
  if (!res.ok) process.exit(1);
}

async function main() {
  if (process.argv.includes("--http")) {
    await sendViaHttp();
    return;
  }
  await sendViaPipeline();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
