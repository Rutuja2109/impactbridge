# Build the APK on your PC and publish to the Play Store (no Expo account needed)

Everything below runs on your own computer. The app code is Expo SDK 58 / React Native 0.88.

## 1. One-time PC setup
1. Install **JDK 17** (Temurin 17). Set the user environment variable `JAVA_HOME` to its folder
   (for example `C:\Program Files\Eclipse Adoptium\jdk-17...`) and put `%JAVA_HOME%\bin` first on `PATH`.
2. Open **Android Studio > More Actions > SDK Manager**. On *SDK Platforms* tick **Android 16 (API 36)** (or 35).
   On *SDK Tools* tick **Android SDK Build-Tools 36**, **NDK (Side by side)**, **CMake**, **Platform-Tools**. Apply.
3. Set `ANDROID_HOME` to `%LOCALAPPDATA%\Android\Sdk` and add `%ANDROID_HOME%\platform-tools` to `PATH`.
4. Open a new terminal and check `java -version` (17) and `adb version`.

## 2. Firebase project (free)
1. https://console.firebase.google.com > **Add project** (name: GoodNeighbour).
2. **Build > Authentication > Get started**. Enable **Email/Password** and **Google** (pick a support email).
3. **Build > Firestore Database > Create database** (production mode, a region near you, e.g. `asia-south1`).
4. **Project settings (gear) > Your apps > Add app > Android**. Package name: `org.goodneighbour.app`.
   Add your **SHA-1** fingerprint (see step 3 below), register, and download **`google-services.json`**.
   Put that file in `apps/mobile/` (it is git-ignored; never commit it).
5. In the same page, scroll to **SDK setup and configuration** (or add a *Web* app) and copy the config values.
   Copy `.env.example` to `.env` and fill in all `EXPO_PUBLIC_FIREBASE_*` values.
6. **Authentication > Sign-in method > Google > Web SDK configuration**: copy the **Web client ID** into
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env`.
7. Deploy the security rules: `npm i -g firebase-tools`, `firebase login`, then in `apps/mobile/firebase`:
   `firebase use --add` (pick your project) and `firebase deploy --only firestore:rules`.
8. Push notifications from the server: upgrade the project to the **Blaze** plan (pay as you go; this small
   usage stays inside the free quota), then in `apps/mobile/firebase/functions` run `npm install`, go back up and run
   `firebase deploy --only functions`.

## 3. Build the test APK
```bash
cd apps/mobile
npm install
npx expo prebuild --platform android --clean      # creates android/ from app.json (+ google-services.json)
```
Get the debug SHA-1 for step 2.4: `cd android && gradlew signingReport` (look for `SHA1` under `debug`), add it in Firebase,
re-download `google-services.json`, and prebuild again.
```bash
cd android
gradlew assembleRelease
```
The APK is `android/app/build/outputs/apk/release/app-release.apk`. Copy it to your phone (cable, Drive or WhatsApp),
tap it, and allow "install unknown apps" for that app once. (By default this release is signed with the debug key, fine for testing.)

## 4. Verify organisations
A new organisation applies in the app (Community tab). You approve it by hand: Firebase console > Firestore > `orgs` >
the document (its id is the person's user id) > set `verified` = **true** and `status` = `"verified"`. Only then can they start communities.
To reject, set `status` = `"rejected"`.

## 5. Publish to the Play Store
1. Create a **release signing key** once (keep the file and passwords safe; losing it means you cannot update the app):
   `keytool -genkeypair -v -storetype PKCS12 -keystore goodneighbour-release.keystore -alias goodneighbour -keyalg RSA -keysize 2048 -validity 10000`
2. Add it to `android/gradle.properties` (not committed):
   `MYAPP_UPLOAD_STORE_FILE=goodneighbour-release.keystore`, `MYAPP_UPLOAD_KEY_ALIAS=goodneighbour`,
   `MYAPP_UPLOAD_STORE_PASSWORD=...`, `MYAPP_UPLOAD_KEY_PASSWORD=...`, and point `signingConfigs.release` in `android/app/build.gradle` at them.
   Add the release key's SHA-1 to Firebase too (so Google sign-in works in the store build).
3. Build the bundle: `cd android && gradlew bundleRelease` -> `android/app/build/outputs/bundle/release/app-release.aab`.
4. Play Console: create the app, fill the store listing (name, short and full description, icon 512x512, feature graphic 1024x500,
   at least 2 phone screenshots), the **Content rating**, **Data safety** form, a **privacy policy URL** (required: the app collects
   email, name and a notification token), and target audience. Upload the `.aab` to **Internal testing** first, test, then promote to Production.
5. For each update, raise `android.versionCode` in `app.json` by 1 before building.

Remember: new personal Play accounts must run a closed test with 12 testers for 14 days before Production is allowed.
