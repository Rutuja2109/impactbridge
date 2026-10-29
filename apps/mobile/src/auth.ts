// Real sign-in through Firebase Authentication: phone number + one-time code (OTP), email + password, and Google.
// Passwords and codes only ever go to Firebase; nothing is stored by the app. Google and phone need the installed app
// (native modules), so Expo Go cannot do them.
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, signInWithCredential,
  signInWithEmailAndPassword, signInWithPhoneNumber, signOut, type getAuth,
} from '@react-native-firebase/auth';
import { deleteDoc, doc } from '@react-native-firebase/firestore';

import { auth, db, googleWebClientId } from './firebase';
import type { User } from './screens/Welcome';

type FbUser = NonNullable<ReturnType<typeof getAuth>['currentUser']>;
export const toUser = (u: FbUser): User => {
  const mail = u.email ?? '';
  const name = u.displayName || mail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { uid: u.uid, email: mail, phone: u.phoneNumber ?? undefined, name: name || u.phoneNumber || '' };
};

export const signInEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth!, email, pass);
export const signUpEmail = (email: string, pass: string) => createUserWithEmailAndPassword(auth!, email, pass);

export const signOutAll = async () => {
  try { const { GoogleSignin } = require('@react-native-google-signin/google-signin'); await GoogleSignin.signOut(); } catch { /* not signed in with Google */ }
  if (auth) await signOut(auth);
};

/** Throws 'google-unavailable' when the native module is missing (Expo Go) and 'google-cancelled' when closed. */
export async function signInGoogle() {
  let GoogleSignin;
  try { ({ GoogleSignin } = require('@react-native-google-signin/google-signin')); } catch { throw new Error('google-unavailable'); }
  if (!GoogleSignin) throw new Error('google-unavailable');
  GoogleSignin.configure({ webClientId: googleWebClientId });
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  const idToken = res?.data?.idToken;
  if (!idToken) throw new Error('google-cancelled');
  return signInWithCredential(auth!, GoogleAuthProvider.credential(idToken));
}

// Phone sign-in: step 1 sends the SMS, step 2 checks the code. On many phones Android reads the SMS by itself and signs in
// without the second step; the auth listener in App.tsx then moves on.
let pending: Awaited<ReturnType<typeof signInWithPhoneNumber>> | null = null;
export async function sendOtp(phoneE164: string) {
  pending = await signInWithPhoneNumber(auth!, phoneE164);
}
export async function confirmOtp(code: string) {
  if (!pending) throw new Error('no-pending-code');
  return pending.confirm(code);
}

export const watchAuth = (cb: (u: User | null) => void) => (auth ? onAuthStateChanged(auth, (u) => cb(u ? toUser(u) : null)) : () => {});

/** Permanently deletes the signed-in account (Play requires this inside the app). Throws auth/requires-recent-login when the
 *  sign-in is too old: the person must sign in again first. Their profile and push token are removed; posts they sent stay
 *  only if an admin approved them, and can be removed on request. */
export async function deleteAccount() {
  const u = auth?.currentUser;
  if (!u) return;
  if (db) await deleteDoc(doc(db, 'users', u.uid)).catch(() => {});
  await deleteUser(u);
}
