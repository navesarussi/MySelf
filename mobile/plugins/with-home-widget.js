const { withEntitlementsPlist } = require("@expo/config-plugins");

/** Shared Keychain access group — used for session token + widget snapshot JSON. */
const KEYCHAIN_ACCESS_GROUP = "$(AppIdentifierPrefix)com.navesarussi.myself";

const HOME_WIDGET_EXTENSION = {
  targetName: "HomeWidget",
  bundleIdentifier: "com.navesarussi.myself.homewidget",
  entitlements: {
    "keychain-access-groups": [KEYCHAIN_ACCESS_GROUP],
  },
};

function withHomeWidget(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    const keychain = cfg.modResults["keychain-access-groups"] || [];
    if (!keychain.includes(KEYCHAIN_ACCESS_GROUP)) keychain.push(KEYCHAIN_ACCESS_GROUP);
    cfg.modResults["keychain-access-groups"] = keychain;
    // App Groups require portal UI configuration ASC API cannot complete; Keychain sharing is enough.
    delete cfg.modResults["com.apple.security.application-groups"];
    return cfg;
  });

  // Tell EAS about the widget extension before prebuild so CI can provision both targets.
  const existing =
    config.extra?.eas?.build?.experimental?.ios?.appExtensions ?? [];
  const hasHomeWidget = existing.some(
    (ext) => ext.targetName === HOME_WIDGET_EXTENSION.targetName
  );
  if (!hasHomeWidget) {
    config = {
      ...config,
      extra: {
        ...config.extra,
        eas: {
          ...config.extra?.eas,
          build: {
            ...config.extra?.eas?.build,
            experimental: {
              ...config.extra?.eas?.build?.experimental,
              ios: {
                ...config.extra?.eas?.build?.experimental?.ios,
                appExtensions: [...existing, HOME_WIDGET_EXTENSION],
              },
            },
          },
        },
      },
    };
  }

  return config;
}

module.exports = withHomeWidget;
