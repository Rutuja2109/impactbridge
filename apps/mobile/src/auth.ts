// Real sign-in through Firebase Authentication: email + password, and Google. The password is only ever sent to
// Firebase; nothing is stored by the app. Google needs the installed app (a native module), so Expo Go cannot do it.
import { deleteDoc, doc } from 'firebase/firestore';
import { GoogleAuthProvider, createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, signInWithCredential, signInWithEmailAndPassword, signOut, type User as FbUser } from 'firebase/auth';

import { auth, db, googleWebClientId } from './firebase';
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

/** Permanently deletes the signed-in account (Play requires this inside the app). Throws auth/requires-recent-login when the
 *  sign-in is too old: the person must sign in again first. Their profile and push token are removed; posts they sent stay
 *  only if an admin approved them, and can be removed on request. */
export async function deleteAccount() {
  const u = auth?.currentUser;
  if (!u) return;
  if (db) await deleteDoc(doc(db, 'users', u.uid)).catch(() => {});
  await deleteUser(u);
}
