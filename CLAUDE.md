# MySelf — Project Notes

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
