import Constants from "expo-constants";

/** Runtime app version from app.json (kept in sync with package.json by CI). */
export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? "–";
}
