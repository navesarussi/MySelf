import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decideOtaPublish,
  hasExpoUpdates,
  resolveTestFlightBuildSha,
  validateExpoUpdatesConfig,
  EXPECTED_EAS_PROJECT_ID,
  TESTFLIGHT_VERSION_BUMP_SUBJECT,
} from "../ci/eas-update-gate";

describe("hasExpoUpdates", () => {
  it("detects expo-updates in dependencies", () => {
    assert.equal(hasExpoUpdates({ dependencies: { "expo-updates": "~29.0.20" } }), true);
  });

  it("detects expo-updates in devDependencies", () => {
    assert.equal(hasExpoUpdates({ devDependencies: { "expo-updates": "~29.0.20" } }), true);
  });

  it("returns false when expo-updates is absent", () => {
    assert.equal(hasExpoUpdates({ dependencies: { expo: "~54.0.0" } }), false);
  });
});

describe("validateExpoUpdatesConfig", () => {
  const valid = {
    expo: {
      runtimeVersion: { policy: "fingerprint" },
      updates: {
        url: `https://u.expo.dev/${EXPECTED_EAS_PROJECT_ID}`,
        enabled: true,
      },
      extra: { eas: { projectId: EXPECTED_EAS_PROJECT_ID } },
    },
  };

  it("accepts a correctly configured app.json", () => {
    const r = validateExpoUpdatesConfig(valid);
    assert.equal(r.ok, true);
    assert.equal(r.runtimeVersionPolicy, "fingerprint");
  });

  it("flags missing updates.url", () => {
    const r = validateExpoUpdatesConfig({
      expo: { ...valid.expo, updates: { enabled: true } },
    });
    assert.equal(r.ok, false);
    assert.match(r.issues.join(" "), /updates\.url/);
  });

  it("flags wrong project id", () => {
    const r = validateExpoUpdatesConfig({
      expo: { ...valid.expo, extra: { eas: { projectId: "other" } } },
    });
    assert.equal(r.ok, false);
    assert.match(r.issues.join(" "), /projectId/);
  });

  it("flags non-fingerprint runtimeVersion policy", () => {
    const r = validateExpoUpdatesConfig({
      expo: { ...valid.expo, runtimeVersion: { policy: "appVersion" } },
    });
    assert.equal(r.ok, false);
    assert.match(r.issues.join(" "), /fingerprint/);
  });
});

describe("resolveTestFlightBuildSha", () => {
  const trigger = "dce49d5f9e87014e467ea59c647f534503c4e233";
  const bump = "b52d2f3c6fb314009be1bf4f61857534e39c3578";

  it("returns post-bump SHA when version bump commit follows trigger", () => {
    const resolved = resolveTestFlightBuildSha(trigger, [
      { sha: bump, subject: TESTFLIGHT_VERSION_BUMP_SUBJECT },
      { sha: "a5f41135b5d9ebdc79ec4623f05b818d550a10ce", subject: "fix(ci): OTA gate" },
    ]);
    assert.equal(resolved, bump);
  });

  it("returns trigger SHA when no bump commit is present", () => {
    const resolved = resolveTestFlightBuildSha(trigger, [
      { sha: "a5f41135b5d9ebdc79ec4623f05b818d550a10ce", subject: "fix(ci): OTA gate" },
    ]);
    assert.equal(resolved, trigger);
  });

  it("returns trigger SHA when commit list is empty", () => {
    assert.equal(resolveTestFlightBuildSha(trigger, []), trigger);
  });
});

describe("decideOtaPublish", () => {
  const base = {
    hasExpoToken: true,
    testFlightSha: "fc92b7bd13b70a5508e2baabde726051561eef35",
    testFlightHasExpoUpdates: true,
    headFingerprint: "abc123",
    testFlightFingerprint: "abc123",
    configOk: true,
  };

  it("skips when EXPO_TOKEN is missing", () => {
    const d = decideOtaPublish({ ...base, hasExpoToken: false });
    assert.equal(d.action, "skip");
    assert.match(d.reason, /EXPO_TOKEN/);
  });

  it("skips when no successful TestFlight run exists", () => {
    const d = decideOtaPublish({ ...base, testFlightSha: null });
    assert.equal(d.action, "skip");
    assert.match(d.reason, /TestFlight/);
  });

  it("skips when last TestFlight build predates expo-updates", () => {
    const d = decideOtaPublish({ ...base, testFlightHasExpoUpdates: false });
    assert.equal(d.action, "skip");
    assert.match(d.reason, /predates expo-updates/);
    assert.match(d.reason, /fc92b7b/);
  });

  it("skips when native fingerprint changed", () => {
    const d = decideOtaPublish({
      ...base,
      headFingerprint: "new-native",
      testFlightFingerprint: "old-native",
    });
    assert.equal(d.action, "skip");
    assert.match(d.reason, /fingerprint changed/);
  });

  it("publishes when fingerprints match and TF has expo-updates", () => {
    const d = decideOtaPublish(base);
    assert.equal(d.action, "publish");
    assert.match(d.reason, /fingerprints match/);
  });

  it("skips when app.json OTA config is invalid", () => {
    const d = decideOtaPublish({ ...base, configOk: false });
    assert.equal(d.action, "skip");
    assert.match(d.reason, /misconfigured/);
  });
});
