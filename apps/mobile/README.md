# GoodNeighbour mobile app

The native GoodNeighbour app: React Native, Expo SDK 57 and TypeScript. Android first, iOS later.
Android package and iOS bundle ID: `org.goodneighbour.app`.

**Why SDK 57:** the Expo Go app in the Google Play Store supports SDK 57 (checked against Expo's version list),
so the app can be tested on a phone without a manual install. Move to a newer SDK when the store version of Expo Go
supports it (`npx expo install expo@latest` then `npx expo install --fix`).

This is a standalone project. It does not touch the backend, the website, `prototype/` or the older
`mobile/` folder, which is an ImpactBridge WebView wrapper kept as it was.

## Status

Foundation only: one placeholder screen in `App.tsx`. The real screens (Home, Discover, Post, Community, Impact)
follow the approved prototype and are built in later steps.

## Requirements

- Node.js `^20.19.4`, `^22.13`, `^24.3` or `>=25` (React Native 0.86 requirement) and npm.
- Expo Go from the Google Play Store on an Android phone, on the same Wi-Fi network as the computer.

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
