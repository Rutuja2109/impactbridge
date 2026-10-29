# GoodNeighbour mobile app

The native GoodNeighbour app: React Native, Expo SDK 58 and TypeScript. Android first, iOS later.
Android package and iOS bundle ID: `org.goodneighbour.app`.

**Expo Go must match the SDK.** Expo Go only opens projects built for its own SDK version, and it updates itself from
the Play Store. This app is on SDK 58 because the Expo Go on the test phone is the SDK 58 build. If Expo Go reports
"Project is incompatible", compare the two versions it lists. To move to a newer SDK, run `npx expo install expo@latest`
then `npx expo install --fix`.

This is a standalone project. It does not touch the backend, the website, `prototype/` or the older
`mobile/` folder, which is an ImpactBridge WebView wrapper kept as it was.

## Status

The Home screen is built (`src/screens/HomeScreen.tsx`) with the bottom bar and the plus-button post choices.
Discover, Community and Impact show a "coming in a later step" screen. All content is local sample data.

## Requirements

- Node.js `^22.13`, `^24.3` or `>=26` (required by Expo SDK 58) and npm.
- Expo Go for SDK 58 on an Android phone, on the same Wi-Fi network as the computer.

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
