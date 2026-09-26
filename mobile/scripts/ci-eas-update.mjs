#!/usr/bin/env node
/**
 * Publish an EAS Update when JS/shared code changed but the native fingerprint
 * still matches the latest production iOS build. Otherwise defer to TestFlight.
 *
 * Env: EXPO_TOKEN (required to publish; script exits 0 with a skip message when missing)
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(__dirname, "..");
const projectId = "6f81d110-b64f-4339-8dc2-2c93ae180fe8";

function log(msg) {
  console.log(`[eas-update] ${msg}`);
}

function requireExpoToken() {
  const token = process.env.EXPO_TOKEN?.trim();
  if (token) return token;
  log("SKIP: EXPO_TOKEN is not set.");
  log("Create one at https://expo.dev/accounts/saussilberg/settings/access-tokens");
  log("Add it as a GitHub repository secret named EXPO_TOKEN (Settings → Secrets → Actions).");
  process.exit(0);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: mobileRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  }).trim();
}

function currentFingerprint() {
  const raw = run("npx", ["@expo/fingerprint", "fingerprint:generate", "--platform", "ios"]);
  const parsed = JSON.parse(raw);
  const hash = parsed.hash ?? parsed.fingerprintHash;
  if (!hash) throw new Error("fingerprint:generate returned no hash");
  return hash;
}

function latestProductionRuntimeVersion() {
  try {
    const raw = run("npx", [
      "eas-cli",
      "build:list",
      "--platform",
      "ios",
      "--status",
      "finished",
      "--limit",
      "5",
      "--json",
      "--non-interactive",
    ]);
    const builds = JSON.parse(raw);
    const production = builds.find((b) => b.channel === "production" || b.profile === "production");
    const pick = production ?? builds[0];
    return pick?.runtimeVersion ?? null;
  } catch (err) {
    log(`Could not read latest iOS build runtimeVersion: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

function gitMessage() {
  const sha = process.env.GITHUB_SHA?.slice(0, 7) ?? "local";
  let subject = "main";
  try {
    subject = run("git", ["log", "-1", "--pretty=%s"]).replace(/"/g, "'");
  } catch {
    /* ignore */
  }
  return `${subject} (${sha})`.slice(0, 240);
}

function main() {
  requireExpoToken();

  const fingerprint = currentFingerprint();
  log(`Current iOS fingerprint: ${fingerprint}`);

  const runtimeVersion = latestProductionRuntimeVersion();
  if (!runtimeVersion) {
    log("SKIP: no finished production iOS build found — publish a TestFlight build with expo-updates first.");
    process.exit(0);
  }

  log(`Latest production iOS runtimeVersion: ${runtimeVersion}`);

  if (runtimeVersion !== fingerprint) {
    log("SKIP: native fingerprint changed — deferring to TestFlight (testflight-ios.yml).");
    log("Changed native deps require a new binary; OTA cannot reach incompatible builds.");
    process.exit(0);
  }

  const message = gitMessage();
  log(`Publishing EAS Update to channel production: ${message}`);
  run("npx", [
    "eas-cli",
    "update",
    "--channel",
    "production",
    "--message",
    message,
    "--non-interactive",
  ], { stdio: "inherit" });

  log("Done — compatible installed builds will pick up the bundle on next cold start.");
}

main();
