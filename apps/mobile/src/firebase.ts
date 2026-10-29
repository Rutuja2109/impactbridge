// Firebase setup. Keys come from apps/mobile/.env (see .env.example). EXPO_PUBLIC_* values must be written out in full
// so the bundler can inline them. When they are missing (for example in Expo Go while developing), `firebaseReady`
// is false and the app falls back to its local demo mode: no sign-in server, no communities, no push.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth, type Persistence } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseReady = !!(config.apiKey && config.projectId && config.appId);
export const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// The React Native build of firebase/auth has this export; its types are only published under another entry point.
const { getReactNativePersistence } = require('firebase/auth') as { getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence };

const app = firebaseReady ? (getApps().length ? getApp() : initializeApp(config)) : null;

function makeAuth(): Auth | null {
  if (!app) return null;
  try { return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) }); } catch { return getAuth(app); }
}

export const auth: Auth | null = makeAuth();
export const db: Firestore | null = app ? getFirestore(app) : null;
