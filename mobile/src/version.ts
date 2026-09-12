/** Runtime app version from app.json (kept in sync with package.json by CI). */
export function getAppVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-constants");
    const Constants = mod?.default ?? mod;
    return Constants?.expoConfig?.version ?? "–";
  } catch {
    return "–";
  }
}
