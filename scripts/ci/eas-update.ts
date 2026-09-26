#!/usr/bin/env tsx
/**
 * Publish an EAS Update when JS/shared code changed but the native fingerprint
 * still matches the last successful TestFlight iOS build (local eas build).
 *
 * Env:
 *   EXPO_TOKEN — required to publish; exits 0 with skip message when missing
 *   GITHUB_SHA — commit being evaluated (HEAD)
 *   GH_TOKEN / GITHUB_TOKEN — for gh run list (defaults in Actions)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execRun } from "../../lib/ci/exec-run";
import {
  decideOtaPublish,
  formatSkipInstructions,
  hasExpoUpdates,
  resolveTestFlightBuildSha,
  validateExpoUpdatesConfig,
  EAS_UPDATE_CHANNEL,
  EAS_UPDATE_ENVIRONMENT,
  type ExpoAppConfig,
  type ExpoPackageJson,
  type GitCommitLine,
} from "../../lib/ci/eas-update-gate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");
const mobileRoot = join(repoRoot, "mobile");
const worktreePath = join(repoRoot, ".git/ci-eas-update-worktree");
const TESTFLIGHT_WORKFLOW = "testflight-ios.yml";

function log(msg: string) {
  console.log(`[eas-update] ${msg}`);
}

function run(cmd: string, args: string[], opts: { cwd?: string; inherit?: boolean } = {}) {
  return execRun(cmd, args, opts, repoRoot);
}

function readJsonAtPath<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonAtSha<T>(sha: string, filePath: string): T {
  const raw = run("git", ["show", `${sha}:${filePath}`]);
  return JSON.parse(raw) as T;
}

function commitsAfterTrigger(triggerSha: string): GitCommitLine[] {
  try {
    const raw = run("git", [
      "log",
      "--first-parent",
      "--reverse",
      "--format=%H %s",
      `${triggerSha}..HEAD`,
      "-10",
    ]);
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const space = line.indexOf(" ");
        return { sha: line.slice(0, space), subject: line.slice(space + 1) };
      });
  } catch {
    return [];
  }
}

function latestSuccessfulTestFlightSha(): string | null {
  try {
    const raw = run("gh", [
      "run",
      "list",
      "--workflow",
      TESTFLIGHT_WORKFLOW,
      "--status",
      "success",
      "--limit",
      "1",
      "--json",
      "headSha,conclusion",
    ]);
    const runs = JSON.parse(raw) as Array<{ headSha?: string; conclusion?: string }>;
    const sha = runs[0]?.headSha?.trim();
    return sha || null;
  } catch (err) {
    log(`Could not list TestFlight workflow runs: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

function fingerprintAt(cwd: string): string {
  const raw = run("npx", ["@expo/fingerprint", "fingerprint:generate", "--platform", "ios"], {
    cwd,
  });
  const parsed = JSON.parse(raw) as { hash?: string; fingerprintHash?: string };
  const hash = parsed.hash ?? parsed.fingerprintHash;
  if (!hash) throw new Error("fingerprint:generate returned no hash");
  return hash;
}

function ensureMobileDeps(cwd: string) {
  if (!existsSync(join(cwd, "node_modules"))) {
    run("npm", ["ci"], { cwd, inherit: true });
  }
}

function removeWorktree() {
  try {
    run("git", ["worktree", "remove", "--force", worktreePath]);
  } catch {
    /* worktree may not exist */
  }
}

function fingerprintForSha(sha: string): string {
  removeWorktree();
  try {
    run("git", ["worktree", "add", "--detach", worktreePath, sha]);
    const wtMobile = join(worktreePath, "mobile");
    ensureMobileDeps(wtMobile);
    return fingerprintAt(wtMobile);
  } finally {
    removeWorktree();
  }
}

function gitMessage(): string {
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
  const hasExpoToken = Boolean(process.env.EXPO_TOKEN?.trim());

  const appConfig = readJsonAtPath<ExpoAppConfig>(join(mobileRoot, "app.json"));
  const config = validateExpoUpdatesConfig(appConfig);
  if (config.ok) {
    log(
      `expo-updates config OK — runtimeVersion.policy=${config.runtimeVersionPolicy}, updates.url set, projectId=${config.projectId}`,
    );
    log(
      "runtimeVersion fingerprint policy embeds at local eas build time — compatible with testflight-ios.yml --local builds",
    );
  } else {
    for (const issue of config.issues) {
      log(`config issue: ${issue}`);
    }
  }

  const testFlightTriggerSha = latestSuccessfulTestFlightSha();
  const testFlightBuildSha = testFlightTriggerSha
    ? resolveTestFlightBuildSha(testFlightTriggerSha, commitsAfterTrigger(testFlightTriggerSha))
    : null;

  if (testFlightTriggerSha) {
    log(`Last successful TestFlight iOS trigger SHA: ${testFlightTriggerSha}`);
    if (testFlightBuildSha && testFlightBuildSha !== testFlightTriggerSha) {
      log(
        `Resolved post-bump build SHA: ${testFlightBuildSha} (binary embeds fingerprint from version-bumped app.json)`,
      );
    }
  }

  let testFlightHasExpoUpdates = false;
  if (testFlightBuildSha) {
    try {
      const pkg = readJsonAtSha<ExpoPackageJson>(testFlightBuildSha, "mobile/package.json");
      testFlightHasExpoUpdates = hasExpoUpdates(pkg);
      log(
        testFlightHasExpoUpdates
          ? `TestFlight build SHA includes expo-updates (${pkg.dependencies?.["expo-updates"] ?? pkg.devDependencies?.["expo-updates"]})`
          : "TestFlight build SHA does not include expo-updates",
      );
    } catch (err) {
      log(
        `Could not read mobile/package.json at ${testFlightBuildSha}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  let headFingerprint: string | null = null;
  let testFlightFingerprint: string | null = null;

  if (testFlightBuildSha && testFlightHasExpoUpdates && config.ok) {
    ensureMobileDeps(mobileRoot);
    headFingerprint = fingerprintAt(mobileRoot);
    log(`HEAD iOS fingerprint: ${headFingerprint}`);

    testFlightFingerprint = fingerprintForSha(testFlightBuildSha);
    log(
      `TestFlight iOS fingerprint (${testFlightBuildSha.slice(0, 7)}): ${testFlightFingerprint}`,
    );
  }

  const decision = decideOtaPublish({
    hasExpoToken,
    testFlightSha: testFlightTriggerSha,
    testFlightHasExpoUpdates,
    headFingerprint,
    testFlightFingerprint,
    configOk: config.ok,
  });

  if (decision.action === "skip") {
    log(`SKIP: ${decision.reason}`);
    for (const line of formatSkipInstructions(decision.reason)) {
      log(line);
    }
    process.exit(0);
  }

  const message = gitMessage();
  log(`Publishing EAS Update to channel ${EAS_UPDATE_CHANNEL}: ${message}`);
  run(
    "npx",
    [
      "eas-cli",
      "update",
      "--channel",
      EAS_UPDATE_CHANNEL,
      "--environment",
      EAS_UPDATE_ENVIRONMENT,
      "--message",
      message,
      "--non-interactive",
    ],
    { cwd: mobileRoot, inherit: true },
  );

  log("Done — compatible installed builds will pick up the bundle on next cold start.");
}

main();
