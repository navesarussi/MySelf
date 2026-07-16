# Web domain = Expo SPA

As of 2026-07-17, `myselfapp.xyz` serves the **Expo web app** at the domain root.

| Path | Serves |
|---|---|
| `/`, `/tasks`, `/login`, … | Expo SPA (`public/spa`, via `proxy.ts` rewrite) |
| `/api/*` | Next.js API |
| `/privacy` | Next.js privacy page |
| `/legacy/*` | Previous Next.js website (preserved, not deleted) |

## Local

```bash
# Native / Expo Go (API → production by default)
cd mobile && npx expo start

# Full web stack (export SPA then Next)
npm run export:web
npm run dev
# open http://localhost:3000  → Expo SPA
# open http://localhost:3000/legacy → old site
```

## Deploy

`npm run build` runs `scripts/export-expo-web.sh` then `next build`. Vercel uses the same build script.
