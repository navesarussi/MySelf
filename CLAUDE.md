# MySelf — Project Notes

## Current scope: Expo app primary (mobile + web domain)

**As of 2026-07-17:**

- **Primary product:** `mobile/` (Expo) — native apps and the web SPA at the production domain root.
- **Backend:** `app/api/**`, `lib/**`, `supabase/**` serve the app.
- **Legacy website:** preserved under `/legacy` (Next.js UI moved to `app/legacy/**`). Do not polish it unless explicitly asked.
- **Privacy:** remains at `/privacy` for App Store / login links.

Agents: if a request is ambiguous, assume Expo app work. See `.cursor/rules/app-only-scope.mdc`.

## Domain / build

- `npm run build` runs `scripts/export-expo-web.sh` then `next build`.
- Expo web export lands in `public/spa/` (gitignored); `proxy.ts` rewrites non-API UI routes to that SPA.

## Version tracking (strict)

The app displays its current version (from `package.json` → `version`, exposed via `lib/version.ts`) in small
text under the site title in `components/nav.tsx`.

**Rule: the version in `package.json` must be bumped on every one of these events:**

1. Every push/merge to `main` (i.e. every production deploy on Vercel) — bump before or as part of that push.
2. Every time a native app build is cut for Android or iPhone (if/when a Capacitor/Expo/React Native wrapper
   is added to this repo) — bump `package.json` **and** the native version fields (Android
   `versionCode`/`versionName`, iOS `CFBundleVersion`/`CFBundleShortVersionString`) together, in the same commit.

Use semver (`major.minor.patch`):
- `patch` — bug fixes, small tweaks.
- `minor` — new features/screens.
- `major` — breaking changes to data model or auth flow.

Do not skip this even for small changes — the whole point is tight version tracking, so every deploy must be
individually identifiable from the UI.
