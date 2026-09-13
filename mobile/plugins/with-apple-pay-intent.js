const fs = require("fs");
const path = require("path");
const { withDangerousMod, withXcodeProject } = require("@expo/config-plugins");

const NATIVE_DIR = "native-ios";
const APP_GROUP = "app";

const SOURCE_FILES = [
  "FinanceIngestKeychain.swift",
  "FinanceIngestBridge.swift",
  "LogApplePayExpenseIntent.swift",
  "MySelfAppShortcuts.swift",
  "FinanceIngestBridge.m",
];

function copyNativeFiles(projectRoot, iosRoot) {
  const srcDir = path.join(projectRoot, NATIVE_DIR);
  const destDir = path.join(iosRoot, APP_GROUP);
  fs.mkdirSync(destDir, { recursive: true });

  for (const file of SOURCE_FILES) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}

function addFilesToXcodeProject(project, iosRoot) {
  const target = project.getFirstTarget().uuid;
  const groupKey =
    project.findPBXGroupKey({ name: APP_GROUP }) ||
    project.findPBXGroupKey({ path: APP_GROUP });

  for (const file of SOURCE_FILES) {
    const filePath = path.join(APP_GROUP, file);
    if (project.hasFile(filePath)) continue;
    project.addSourceFile(filePath, { target }, groupKey);
  }
}

function withApplePayIntent(config) {
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      copyNativeFiles(cfg.modRequest.projectRoot, cfg.modRequest.platformProjectRoot);
      return cfg;
    },
  ]);

  config = withXcodeProject(config, (cfg) => {
    addFilesToXcodeProject(cfg.modResults, cfg.modRequest.platformProjectRoot);
    return cfg;
  });

  return config;
}

module.exports = withApplePayIntent;
