/**
 * Design tokens — values are defined in app/globals.css as CSS custom properties.
 * Use Tailwind classes (bg-accent, text-good, …) in components; import this file
 * when you need token names in TypeScript or documentation.
 */
export const colorTokens = {
  bg: "--bg",
  surface: "--surface",
  border: "--border",
  ink: "--ink",
  muted: "--muted",
  accent: "--accent",
  accent2: "--accent2",
  warn: "--warn",
  good: "--good",
} as const;

export type ColorToken = keyof typeof colorTokens;

export const palette = {
  dark: {
    bg: "#0b0c10",
    surface: "#15171d",
    border: "#262a33",
    ink: "#f3f4f6",
    muted: "#9aa0ab",
    accent: "#7dd3c0",
    accent2: "#e8b86d",
    warn: "#e2725b",
    good: "#7dd3a7",
  },
  light: {
    bg: "#f7f6f3",
    surface: "#ffffff",
    border: "#e6e3dc",
    ink: "#1d1f24",
    muted: "#6b7178",
    accent: "#1f7a68",
    accent2: "#b5791f",
    warn: "#b23e28",
    good: "#1f7a4a",
  },
} as const;
