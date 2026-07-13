// Metro config: the app imports pure shared modules straight from the repo
// root (lib/types, lib/i18n, lib/habit-stats, ...) so web and native share one
// source of truth. Server-only modules (next/*, supabase) must never be
// imported from mobile code.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
