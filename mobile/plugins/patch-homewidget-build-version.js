/**
 * @bacons/apple-targets sets widget CURRENT_PROJECT_VERSION from config.ios.buildNumber
 * at prebuild time, which drifts from EAS remote autoIncrement on the main app.
 * Mirror the App Clip pattern: honor EAS_BUILD_IOS_BUILD_NUMBER when present.
 */
const configList = require("@bacons/apple-targets/build/configuration-list");

if (!configList.__homewidgetBuildVersionPatched) {
  const originalCreateWidgetConfigurationList =
    configList.createWidgetConfigurationList;

  configList.createWidgetConfigurationList = function createWidgetConfigurationList(
    params
  ) {
    const buildNumber =
      process.env.EAS_BUILD_IOS_BUILD_NUMBER ?? params.currentProjectVersion ?? 1;

    const configs = originalCreateWidgetConfigurationList({
      ...params,
      currentProjectVersion: buildNumber,
    });

    if (process.env.EAS_BUILD_IOS_BUILD_NUMBER) {
      for (const key of ["debug", "release"]) {
        if (configs[key]) {
          configs[key].CURRENT_PROJECT_VERSION = String(
            process.env.EAS_BUILD_IOS_BUILD_NUMBER
          );
        }
      }
    }

    return configs;
  };

  configList.__homewidgetBuildVersionPatched = true;
}
