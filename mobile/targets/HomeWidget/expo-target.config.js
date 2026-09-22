/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
const APP_GROUP = "group.com.navesarussi.myself";

module.exports = (config) => ({
  type: "widget",
  name: "HomeWidget",
  displayName: "MySelf",
  bundleIdentifier: "com.navesarussi.myself.homewidget",
  deploymentTarget: "17.0",
  entitlements: {
    "com.apple.security.application-groups": [APP_GROUP],
    "keychain-access-groups": ["$(AppIdentifierPrefix)com.navesarussi.myself"],
  },
});
