# GoodNeighbour mobile app

The native GoodNeighbour app: React Native, Expo SDK 58 and TypeScript. Android first, iOS later.
Android package and iOS bundle ID: `org.goodneighbour.app`.

This is a standalone project. It does not touch the backend, the website, `prototype/` or the older
`mobile/` folder, which is an ImpactBridge WebView wrapper kept as it was.

## Status

Foundation only: one placeholder screen in `App.tsx`. The real screens (Home, Discover, Post, Community, Impact)
follow the approved prototype and are built in later steps.

## Requirements

- Node.js `^22.13`, `^24.3` or `>=26` (required by Expo SDK 58) and npm.
- Expo Go on an Android phone for development on the same Wi-Fi network.

## Commands

```bash
cd apps/mobile
npm ci                 # install exactly what package-lock.json lists
npm run typecheck      # TypeScript check
npx expo start         # start the dev server, then scan the QR code with Expo Go
npx expo export --platform android   # check that an Android bundle builds (output goes to dist/, which is git-ignored)
```

## Not set up yet (added when a feature needs it)

Navigation, data fetching, secure token storage, push notifications, image and file pickers, translations,
a themed design system, a splash screen, GoodNeighbour icons (the current icons are placeholders copied from `mobile/`),
EAS build profiles and CI for the app.
