// Real posts. A submitted form is saved as a "pending" document; only an admin can approve it (status = 'approved' in the
// Firebase console), and only then does it appear for everyone. The private contact stays in a separate document that
// only its author can read. applyLive() turns the approved posts into the cards the screens already know.
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, writeBatch, where } from '@react-native-firebase/firestore';
import { useEffect } from 'react';

import { applyLive, type PostDoc } from '../data';
import { db } from '../firebase';
import type { User } from '../screens/Welcome';
import { savePhotos } from './files';
import { PRIVATE, blankPost, type Attach, type Flow, type PostData } from './post';

const FILES = ['files', 'cover', 'docs']; // the picker is a placeholder; no file is uploaded

export async function submitPost(u: User, flow: Flow, data: PostData): Promise<string> {
  const pub: Record<string, unknown> = {};
  const priv: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (FILES.includes(k)) continue;
    (PRIVATE.includes(k) ? priv : pub)[k] = v;
  }
  const pics = [...((data.cover as Attach[]) ?? []), ...((data.files as Attach[]) ?? [])];
  const thumb = pics.find((a) => a.thumb)?.thumb ?? '';
  const ref = await addDoc(collection(db!, 'posts'), { flow, data: pub, ownerId: u.uid, ownerName: u.name, status: 'pending', createdAt: Date.now(), thumb });
  await setDoc(doc(db!, 'posts', ref.id, 'private', 'info'), { ...priv, ownerEmail: u.email });
  await setDoc(doc(db!, 'users', u.uid!), { posted: true }, { merge: true }).catch(() => {});
  await savePhotos(ref.id, { files: (data.files as Attach[]) ?? [], cover: (data.cover as Attach[]) ?? [], docs: (data.docs as Attach[]) ?? [] });
  return ref.id;
}

/** A saved post as the form needs it (public fields, the private contact and the photos), or null if it is gone. */
export async function loadForEdit(id: string): Promise<{ flow: Flow; data: PostData } | null> {
  const snap = await getDoc(doc(db!, 'posts', id));
  if (!snap.exists()) return null;
  const x = snap.data() ?? {};
  const priv = (await getDoc(doc(db!, 'posts', id, 'private', 'info')).catch(() => null))?.data() ?? {};
  const rows = await getDocs(collection(db!, 'posts', id, 'files')).catch(() => null);
  const groups: Record<string, Attach[]> = { files: [], cover: [], docs: [] };
  rows?.docs.forEach((f) => {
    const v = f.data();
    const b64 = String(v.b64 ?? '');
    if (b64 && groups[String(v.field)]) groups[String(v.field)].push({ name: String(v.name ?? 'photo.jpg'), size: Math.round(b64.length * 0.75), b64 });
  });
  return { flow: x.flow as Flow, data: { ...blankPost(), ...(x.data ?? {}), private: String(priv.private ?? ''), ...groups } as PostData };
}

/** Saves the edited form over the same post and sends it back to review: a live post is hidden again until an admin approves it. */
export async function updatePost(u: User, id: string, data: PostData): Promise<void> {
  const pub: Record<string, unknown> = {};
  const priv: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (FILES.includes(k)) continue;
    (PRIVATE.includes(k) ? priv : pub)[k] = v;
  }
  const pics = [...((data.cover as Attach[]) ?? []), ...((data.files as Attach[]) ?? [])];
  const thumb = pics.find((a) => a.thumb)?.thumb;
  await updateDoc(doc(db!, 'posts', id), { data: pub, status: 'pending', editedAt: Date.now(), ...(thumb ? { thumb } : {}) });
  await setDoc(doc(db!, 'posts', id, 'private', 'info'), { ...priv, ownerEmail: u.email });
  const old = await getDocs(collection(db!, 'posts', id, 'files'));
  await Promise.all(old.docs.map((d) => deleteDoc(d.ref)));
  await savePhotos(id, { files: (data.files as Attach[]) ?? [], cover: (data.cover as Attach[]) ?? [], docs: (data.docs as Attach[]) ?? [] });
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
export async function respond(u: User, postId: string, kind: 'volunteer' | 'items', title = '') {
  const at = Date.now();
  const b = writeBatch(db!);
  b.set(doc(db!, 'posts', postId, 'responses', u.uid!), { kind, name: u.name, email: u.email, at, status: 'new' });
  b.set(doc(db!, 'users', u.uid!, 'helps', postId), { kind, title, at }); // the person's own record, behind their badge and certificate
  b.set(doc(db!, 'users', u.uid!), { helped: true }, { merge: true });
  await b.commit();
}
