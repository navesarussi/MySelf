export type AppearancePreference = "system" | "light" | "dark";
export type ColorScheme = "light" | "dark";

export const DEFAULT_APPEARANCE: AppearancePreference = "system";

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** Match the previous ThemeProvider: unknown/null system scheme → dark. */
export function resolveAppearance(
  preference: AppearancePreference,
  system: ColorScheme | null | undefined
): ColorScheme {
  if (preference === "light" || preference === "dark") return preference;
  return system === "light" ? "light" : "dark";
}
