/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "HomeWidget",
  displayName: "MySelf",
  bundleIdentifier: "com.navesarussi.myself.homewidget",
  deploymentTarget: "17.0",
  entitlements: {
    "keychain-access-groups": ["$(AppIdentifierPrefix)com.navesarussi.myself"],
  },
});
