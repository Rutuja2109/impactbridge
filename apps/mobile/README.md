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

## Google sign-in setup

To enable the real Google sign-in button in the app, create a Google Cloud OAuth client for the app:

1. Create a Google Cloud project and enable the Google Identity API.
2. Configure an OAuth client ID for Android using the package name `org.goodneighbour.app`.
3. Configure an OAuth client ID for iOS using the bundle ID `org.goodneighbour.app`.
4. Create a Web OAuth client and keep its client ID.
5. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in the values:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

```env
EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID=your_expo_client_id
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your_android_client_id
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your_ios_client_id
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_web_client_id
```

Once the IDs are set, the Google button in the welcome screen performs a real Google OAuth flow and stores only the signed-in user name and email on the device.

## Not set up yet (added when a feature needs it)

Navigation, data fetching, secure token storage, push notifications, image and file pickers, translations,
a themed design system, a splash screen, GoodNeighbour icons (the current icons are placeholders copied from `mobile/`),
EAS build profiles and CI for the app.
