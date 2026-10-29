// Real sign-in through Firebase Authentication: email + password, and Google. The password is only ever sent to
// Firebase; nothing is stored by the app. Google needs the installed app (a native module), so Expo Go cannot do it.
import { GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, signInWithCredential, signInWithEmailAndPassword, signOut, type User as FbUser } from 'firebase/auth';

import { auth, googleWebClientId } from './firebase';
import type { User } from './screens/Welcome';

export const toUser = (u: FbUser): User => ({
  uid: u.uid,
  email: u.email ?? '',
  name: u.displayName || (u.email ?? '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
});

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

export const watchAuth = (cb: (u: User | null) => void) => (auth ? onAuthStateChanged(auth, (u) => cb(u ? toUser(u) : null)) : () => {});
