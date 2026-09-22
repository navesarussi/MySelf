const { withEntitlementsPlist } = require("@expo/config-plugins");

const APP_GROUP = "group.com.navesarussi.myself";

function withHomeWidget(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    const groups = cfg.modResults["com.apple.security.application-groups"] || [];
    if (!groups.includes(APP_GROUP)) groups.push(APP_GROUP);
    cfg.modResults["com.apple.security.application-groups"] = groups;
    const keychain = cfg.modResults["keychain-access-groups"] || [];
    const kg = "$(AppIdentifierPrefix)com.navesarussi.myself";
    if (!keychain.includes(kg)) keychain.push(kg);
    cfg.modResults["keychain-access-groups"] = keychain;
    return cfg;
  });
  return config;
}

module.exports = withHomeWidget;
