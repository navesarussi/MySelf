const fs = require("fs");
const path = require("path");
const { withDangerousMod, withXcodeProject } = require("@expo/config-plugins");
const {
  addBuildSourceFileToGroup,
  getProjectName,
} = require("@expo/config-plugins/build/ios/utils/Xcodeproj");

const NATIVE_DIR = "native-ios";

const SOURCE_FILES = [
  "FinanceIngestKeychain.swift",
  "FinanceIngestBridge.swift",
  "LogApplePayExpenseIntent.swift",
  "MySelfAppShortcuts.swift",
  "FinanceIngestBridge.m",
];

function withApplePayIntent(config) {
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const projectName = getProjectName(cfg.modRequest.projectRoot);
      const srcDir = path.join(cfg.modRequest.projectRoot, NATIVE_DIR);
      const destDir = path.join(cfg.modRequest.platformProjectRoot, projectName);
      fs.mkdirSync(destDir, { recursive: true });

      for (const file of SOURCE_FILES) {
        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
      }
      return cfg;
    },
  ]);

  config = withXcodeProject(config, (cfg) => {
    const projectName = getProjectName(cfg.modRequest.projectRoot);
    let project = cfg.modResults;

    for (const file of SOURCE_FILES) {
      const filePath = path.join(projectName, file);
      if (project.hasFile(filePath)) continue;
      project = addBuildSourceFileToGroup({
        filepath: filePath,
        groupName: projectName,
        project,
      });
    }

    cfg.modResults = project;
    return cfg;
  });

  return config;
}

module.exports = withApplePayIntent;
