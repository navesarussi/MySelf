/**
 * OTA publish gate for EAS Update — compares native fingerprints between HEAD
 * and the last successful TestFlight iOS build (local eas build, not on EAS cloud).
 */

export const EXPECTED_EAS_PROJECT_ID = "6f81d110-b64f-4339-8dc2-2c93ae180fe8";
export const EAS_UPDATE_CHANNEL = "production";
export const EAS_UPDATE_ENVIRONMENT = "production";

export type ExpoPackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type ExpoAppConfig = {
  expo?: {
    runtimeVersion?: { policy?: string } | string;
    updates?: { url?: string; enabled?: boolean };
    extra?: { eas?: { projectId?: string } };
  };
};

export function hasExpoUpdates(pkg: ExpoPackageJson): boolean {
  return Boolean(
    pkg.dependencies?.["expo-updates"] ?? pkg.devDependencies?.["expo-updates"],
  );
}

export type ConfigValidation = {
  ok: boolean;
  issues: string[];
  runtimeVersionPolicy?: string;
  updatesUrl?: string;
  projectId?: string;
};

/** Validates app.json fields required for installed binaries to receive OTA bundles. */
export function validateExpoUpdatesConfig(
  appConfig: ExpoAppConfig,
  projectId = EXPECTED_EAS_PROJECT_ID,
): ConfigValidation {
  const issues: string[] = [];
  const expo = appConfig.expo;
  const policy =
    typeof expo?.runtimeVersion === "object" ? expo.runtimeVersion.policy : undefined;
  const updatesUrl = expo?.updates?.url;
  const configuredProjectId = expo?.extra?.eas?.projectId;

  if (!updatesUrl) {
    issues.push("expo.updates.url is missing");
  } else if (!updatesUrl.includes(projectId)) {
    issues.push(`expo.updates.url does not reference project id ${projectId}`);
  }

  if (configuredProjectId !== projectId) {
    issues.push(`extra.eas.projectId must be ${projectId}`);
  }

  if (policy !== "fingerprint") {
    issues.push(`runtimeVersion.policy should be "fingerprint" (got ${policy ?? "unset"})`);
  }

  if (expo?.updates?.enabled === false) {
    issues.push("expo.updates.enabled is false");
  }

  return {
    ok: issues.length === 0,
    issues,
    runtimeVersionPolicy: policy,
    updatesUrl,
    projectId: configuredProjectId,
  };
}

export type OtaGateInput = {
  hasExpoToken: boolean;
  testFlightSha: string | null;
  testFlightHasExpoUpdates: boolean;
  headFingerprint: string | null;
  testFlightFingerprint: string | null;
  configOk: boolean;
};

export type OtaGateDecision =
  | { action: "skip"; reason: string }
  | { action: "publish"; reason: string };

export function decideOtaPublish(input: OtaGateInput): OtaGateDecision {
  if (!input.hasExpoToken) {
    return { action: "skip", reason: "EXPO_TOKEN is not set" };
  }

  if (!input.configOk) {
    return {
      action: "skip",
      reason: "expo-updates is misconfigured in mobile/app.json — fix updates.url and extra.eas.projectId",
    };
  }

  if (!input.testFlightSha) {
    return {
      action: "skip",
      reason:
        "no successful TestFlight iOS workflow run found — publish a TestFlight build with expo-updates first",
    };
  }

  if (!input.testFlightHasExpoUpdates) {
    return {
      action: "skip",
      reason: `last successful TestFlight build (${input.testFlightSha.slice(0, 7)}) predates expo-updates — run testflight-ios.yml after merging OTA support`,
    };
  }

  if (!input.testFlightFingerprint || !input.headFingerprint) {
    return {
      action: "skip",
      reason: "could not compute native fingerprint for TestFlight SHA or HEAD",
    };
  }

  if (input.headFingerprint !== input.testFlightFingerprint) {
    return {
      action: "skip",
      reason:
        "native fingerprint changed — deferring to TestFlight (testflight-ios.yml). Changed native deps require a new binary; OTA cannot reach incompatible builds.",
    };
  }

  return {
    action: "publish",
    reason: `fingerprints match (${input.headFingerprint.slice(0, 12)}…) — JS-only changes can ship OTA`,
  };
}

export function formatSkipInstructions(reason: string): string[] {
  if (reason === "EXPO_TOKEN is not set") {
    return [
      "Create one at https://expo.dev/accounts/saussilberg/settings/access-tokens",
      "Add it as a GitHub repository secret named EXPO_TOKEN (Settings → Secrets → Actions).",
    ];
  }
  return [];
}
