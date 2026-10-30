// Real sign-in through Firebase Authentication: email + password (with email verification and a reset link) and Google.
// Passwords only ever go to Firebase; nothing is stored by the app. Google needs the installed app (a native module),
// so Expo Go cannot do it.
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, signInWithCredential,
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type getAuth,
} from '@react-native-firebase/auth';
import { collection, deleteDoc, doc, getDocs, query, where } from '@react-native-firebase/firestore';

import { auth, db, googleWebClientId } from './firebase';
import type { User } from './screens/Welcome';

type FbUser = NonNullable<ReturnType<typeof getAuth>['currentUser']>;
export const toUser = (u: FbUser): User => {
  const mail = u.email ?? '';
  const name = u.displayName || mail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { uid: u.uid, email: mail, phone: u.phoneNumber ?? undefined, name: name || u.phoneNumber || '' };
};

// An email + password account only counts as signed in after its owner has opened the link we email them, so a made-up or
// mistyped address can never get in. Google and phone sign-ins are already verified by Google and by the SMS code.
const needsVerify = (u: FbUser) => !u.emailVerified && u.providerData.length > 0 && u.providerData.every((p) => p.providerId === 'password');

export const signInEmail = async (email: string, pass: string) => {
  const cred = await signInWithEmailAndPassword(auth!, email, pass);
  if (needsVerify(cred.user)) await sendEmailVerification(cred.user).catch(() => {});
  return cred;
};
export const signUpEmail = async (email: string, pass: string) => {
  const cred = await createUserWithEmailAndPassword(auth!, email, pass);
  await sendEmailVerification(cred.user).catch(() => {});
  return cred;
};
/** Emails a link for choosing a new password. */
export const resetPassword = (email: string) => sendPasswordResetEmail(auth!, email);
export const resendVerification = async () => { if (auth?.currentUser) await sendEmailVerification(auth.currentUser); };
/** Re-reads the account from Firebase; returns the person once their email is verified, otherwise null. */
export async function checkVerified(): Promise<User | null> {
  const u = auth?.currentUser;
  if (!u) return null;
  await u.reload();
  return auth!.currentUser && !needsVerify(auth!.currentUser) ? toUser(auth!.currentUser) : null;
}

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

export const watchAuth = (cb: (u: User | null) => void) => (auth ? onAuthStateChanged(auth, (u) => cb(u && !needsVerify(u) ? toUser(u) : null)) : () => {});

/** Permanently deletes the signed-in account (Play requires this inside the app). Throws auth/requires-recent-login when the
 *  sign-in is too old: the person must sign in again first. Their profile and push token are removed; posts they sent stay
 *  only if an admin approved them, and can be removed on request. */
export async function deleteAccount() {
  const u = auth?.currentUser;
  if (!u) return;
  if (db) {
    // Posts the person shared, with their photos, private contact, offers of help and reports of payments.
    const mine = await getDocs(query(collection(db, 'posts'), where('ownerId', '==', u.uid))).catch(() => null);
    for (const p of mine?.docs ?? []) {
      for (const sub of ['files', 'private', 'responses', 'donations']) {
        const rows = await getDocs(collection(db, 'posts', p.id, sub)).catch(() => null);
        await Promise.all((rows?.docs ?? []).map((d) => deleteDoc(d.ref).catch(() => {})));
      }
      await deleteDoc(p.ref).catch(() => {});
    }
    // Their own records: help given, notifications, joined communities and the profile itself.
    for (const sub of ['helps', 'notifications']) {
      const rows = await getDocs(collection(db, 'users', u.uid, sub)).catch(() => null);
      await Promise.all((rows?.docs ?? []).map((d) => deleteDoc(d.ref).catch(() => {})));
    }
    await deleteDoc(doc(db, 'users', u.uid)).catch(() => {});
  }
  await deleteUser(u);
}
