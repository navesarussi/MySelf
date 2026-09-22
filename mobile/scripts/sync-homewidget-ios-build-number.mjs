#!/usr/bin/env node
/**
 * After eas/configure_ios_version, copy MeAndMySelf CFBundleVersion onto HomeWidget
 * CURRENT_PROJECT_VERSION in project.pbxproj (extensions with GENERATE_INFOPLIST_FILE).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import plistModule from "@expo/plist";

const plist = plistModule.default ?? plistModule;
import xcode from "xcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.join(__dirname, "..");
const iosDir = path.join(mobileDir, "ios");
const mainTarget = "MeAndMySelf";
const widgetTarget = "HomeWidget";

function readMainAppBuildNumber(project) {
  if (process.env.IOS_BUILD_NUMBER) {
    return String(process.env.IOS_BUILD_NUMBER);
  }

  const infoPlistPath = path.join(iosDir, mainTarget, "Info.plist");
  if (fs.existsSync(infoPlistPath)) {
    const info = plist.parse(fs.readFileSync(infoPlistPath, "utf8"));
    if (info.CFBundleVersion) return String(info.CFBundleVersion);
  }

  const target = project.pbxTargetByName(mainTarget);
  if (!target?.buildConfigurationList) return null;

  const configLists = project.pbxXCConfigurationList();
  const buildConfigs = project.pbxXCBuildConfigurationSection();
  const list = configLists[target.buildConfigurationList];
  const configIds = (list?.buildConfigurations ?? []).map((entry) => entry.value);

  for (const configId of configIds) {
    const value = buildConfigs[configId]?.buildSettings?.CURRENT_PROJECT_VERSION;
    if (value !== undefined && value !== "") return String(value);
  }

  return null;
}

const pbxPath = path.join(iosDir, `${mainTarget}.xcodeproj`, "project.pbxproj");
if (!fs.existsSync(pbxPath)) {
  console.warn("[sync-homewidget-ios-build-number] ios project missing, skipping");
  process.exit(0);
}

const project = xcode.project(pbxPath);
project.parseSync();

const buildNumber = readMainAppBuildNumber(project);
if (!buildNumber) {
  console.warn("[sync-homewidget-ios-build-number] could not resolve main app build number");
  process.exit(0);
}

if (!project.pbxTargetByName(widgetTarget)) {
  console.warn("[sync-homewidget-ios-build-number] HomeWidget target missing, skipping");
  process.exit(0);
}

project.updateBuildProperty(
  "CURRENT_PROJECT_VERSION",
  buildNumber,
  undefined,
  widgetTarget
);

fs.writeFileSync(pbxPath, project.writeSync());
console.log(
  `[sync-homewidget-ios-build-number] HomeWidget CURRENT_PROJECT_VERSION -> ${buildNumber}`
);
