// A small profile document for every signed-in person (users/{uid}): when they joined and when they last opened the app.
// The admin dashboard counts accounts and active people from these.
import { doc, getDoc, setDoc } from '@react-native-firebase/firestore';

import { db } from '../firebase';

export async function touchProfile(uid: string, name: string, email: string): Promise<void> {
  try {
    const ref = doc(db!, 'users', uid);
    const now = Date.now();
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data()?.createdAt) await setDoc(ref, { lastSeen: now }, { merge: true });
    else await setDoc(ref, { name, email, createdAt: now, lastSeen: now }, { merge: true });
  } catch { /* the app works without it */ }
}
