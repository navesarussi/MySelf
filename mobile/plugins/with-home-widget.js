const { withEntitlementsPlist } = require("@expo/config-plugins");

/** Shared Keychain access group — used for session token + widget snapshot JSON. */
const KEYCHAIN_ACCESS_GROUP = "$(AppIdentifierPrefix)com.navesarussi.myself";

function withHomeWidget(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    const keychain = cfg.modResults["keychain-access-groups"] || [];
    if (!keychain.includes(KEYCHAIN_ACCESS_GROUP)) keychain.push(KEYCHAIN_ACCESS_GROUP);
    cfg.modResults["keychain-access-groups"] = keychain;
    // App Groups require portal UI configuration ASC API cannot complete; Keychain sharing is enough.
    delete cfg.modResults["com.apple.security.application-groups"];
    return cfg;
  });
  return config;
}

module.exports = withHomeWidget;
