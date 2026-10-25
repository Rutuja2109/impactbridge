# ImpactBridge on your phone (Expo Go)

The app shows the ImpactBridge web app full screen. Your laptop runs the server; your phone runs Expo Go.

1. Install **Node.js LTS** on the laptop (nodejs.org) and **Expo Go** on the phone (Play Store).
2. Start the server (first Command Prompt):
   cd C:\Users\Admin\Downloads\impactbridge\impactbridge\backend
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
3. Check the address in `app.json` -> `extra.webUrl` matches your laptop's IPv4 address (`ipconfig`).
4. Start the app (second Command Prompt):
   cd C:\Users\Admin\Downloads\impactbridge\impactbridge\mobile
   npm install
   npx expo install --fix
   npx expo start
5. Open Expo Go on the phone (same Wi-Fi) and scan the QR code.

If Expo Go says the project uses an incompatible SDK, run `npx expo install expo@^NN --fix` with the SDK number
Expo Go shows (for example 55), then `npx expo start` again.
