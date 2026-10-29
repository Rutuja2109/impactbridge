// Real posts. A submitted form is saved as a "pending" document; only an admin can approve it (status = 'approved' in the
// Firebase console), and only then does it appear for everyone. The private contact stays in a separate document that
// only its author can read. applyLive() turns the approved posts into the cards the screens already know.
import { addDoc, collection, doc, onSnapshot, query, setDoc, where } from '@react-native-firebase/firestore';
import { useEffect } from 'react';

import { applyLive, type PostDoc } from '../data';
import { db } from '../firebase';
import type { User } from '../screens/Welcome';
import { PRIVATE, type Flow, type PostData } from './post';

const FILES = ['files', 'cover', 'docs']; // the picker is a placeholder; no file is uploaded

export async function submitPost(u: User, flow: Flow, data: PostData): Promise<string> {
  const pub: Record<string, unknown> = {};
  const priv: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (FILES.includes(k)) continue;
    (PRIVATE.includes(k) ? priv : pub)[k] = v;
  }
  const ref = await addDoc(collection(db!, 'posts'), { flow, data: pub, ownerId: u.uid, ownerName: u.name, status: 'pending', createdAt: Date.now() });
  await setDoc(doc(db!, 'posts', ref.id, 'private', 'info'), { ...priv, ownerEmail: u.email });
  return ref.id;
}

/** Keeps the lists in src/data filled with the approved posts, and calls onChange so screens redraw. */
export function useLiveSync(uid: string | undefined, onChange: () => void) {
  useEffect(() => {
    if (!db || !uid) return undefined;
    return onSnapshot(
      query(collection(db, 'posts'), where('status', '==', 'approved')),
      (s) => { applyLive(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PostDoc, 'id'>) }))); onChange(); },
      () => {},
    );
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** A person reports a post, community or person; an admin reviews the reports in the Firebase console. */
export const report = (u: User, targetType: 'post' | 'community', targetId: string, reason: string) =>
  addDoc(collection(db!, 'reports'), { targetType, targetId, reason, by: u.uid, at: Date.now() });

/** Someone offers help on an approved post (time or items). The organiser gets a notification and sees the name and email. */
export const respond = (u: User, postId: string, kind: 'volunteer' | 'items') =>
  setDoc(doc(db!, 'posts', postId, 'responses', u.uid!), { kind, name: u.name, email: u.email, at: Date.now() });
