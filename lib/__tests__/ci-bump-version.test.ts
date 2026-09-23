import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(process.cwd(), "mobile/scripts/ci-bump-version.sh");

/**
 * Build a throwaway repo shaped like this one — root package.json, mobile
 * package.json, mobile app.json — and run the real CI script against it.
 */
function runBump(rootVersion: string, mobileVersion: string) {
  const dir = mkdtempSync(join(tmpdir(), "bump-"));
  mkdirSync(join(dir, "mobile/scripts"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "root", version: rootVersion }, null, 2) + "\n");
  writeFileSync(join(dir, "mobile/package.json"), JSON.stringify({ name: "mobile", version: mobileVersion }, null, 2) + "\n");
  writeFileSync(join(dir, "mobile/app.json"), JSON.stringify({ expo: { version: mobileVersion } }, null, 2) + "\n");
  cpSync(SCRIPT, join(dir, "mobile/scripts/ci-bump-version.sh"));

  execFileSync("bash", [join(dir, "mobile/scripts/ci-bump-version.sh")], { stdio: "pipe" });

  const read = (p: string) => JSON.parse(readFileSync(join(dir, p), "utf8"));
  return {
    root: read("package.json").version as string,
    mobile: read("mobile/package.json").version as string,
    app: read("mobile/app.json").expo.version as string,
  };
}

/**
 * CLAUDE.md: "every deploy must be individually identifiable from the UI" —
 * the app shows `package.json.version` under the site title.
 *
 * The script bumped the patch of **mobile's** version and wrote the result to
 * both files. Feature PRs bump only the root (that is what the rule asks for),
 * so the two drift apart — and the next TestFlight run then overwrote a root
 * on 1.31.3 with mobile's 1.27.22. The displayed version went *backwards* after
 * every native build, and the same string could be published twice.
 */
describe("ci-bump-version", () => {
  it("bumps from whichever file is ahead, so the version never goes backwards", () => {
    const out = runBump("1.31.3", "1.27.21");
    assert.equal(out.root, "1.31.4");
    assert.equal(out.mobile, "1.31.4");
    assert.equal(out.app, "1.31.4");
  });

  it("still bumps normally when the two are already in step", () => {
    const out = runBump("1.27.21", "1.27.21");
    assert.equal(out.root, "1.27.22");
    assert.equal(out.mobile, "1.27.22");
  });

  it("follows mobile when mobile is the one ahead", () => {
    const out = runBump("1.27.21", "1.28.0");
    assert.equal(out.root, "1.28.1");
    assert.equal(out.mobile, "1.28.1");
  });

  it("compares numerically, not as strings", () => {
    // "1.9.0" > "1.10.0" as strings; the minor must win on its number.
    assert.equal(runBump("1.10.0", "1.9.0").root, "1.10.1");
    assert.equal(runBump("1.9.0", "1.10.0").root, "1.10.1");
    assert.equal(runBump("2.0.0", "1.99.99").root, "2.0.1");
  });

  it("leaves the three files in agreement", () => {
    const out = runBump("1.31.3", "1.27.21");
    assert.equal(out.root, out.mobile);
    assert.equal(out.root, out.app);
  });
});
