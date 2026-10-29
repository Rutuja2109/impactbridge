// Firebase through the native SDK (React Native Firebase). The project and its keys come from google-services.json inside the
// build, so nothing has to be copied by hand. The only switch is EXPO_PUBLIC_FIREBASE_ENABLED=1, which the cloud build sets
// when google-services.json is present. Without it (Expo Go while developing) `firebaseReady` is false and the app runs in
// its local demo mode: no sign-in server, no communities, no push.
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';

export const firebaseReady = process.env.EXPO_PUBLIC_FIREBASE_ENABLED === '1';
export const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export const auth: ReturnType<typeof getAuth> | null = firebaseReady ? getAuth() : null;
export const db: ReturnType<typeof getFirestore> | null = firebaseReady ? getFirestore() : null;
