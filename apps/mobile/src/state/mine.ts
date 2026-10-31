// A person's own activity, read live from Firestore: the posts they shared (with review status) and the offers of help they
// made. Badges and certificates are worked out from these, so they are saved to the account and survive a reinstall.
import { collection, onSnapshot, query, where } from '@react-native-firebase/firestore';

import { db } from '../firebase';
import { useLive } from './communities';

export type MyPost = { id: string; title: string; flow: 'problem' | 'project' | 'fund'; status: string; at: number; note?: string; kind?: string };
export type MyHelp = { id: string; title: string; kind: string; at: number };

export const useMyPosts = (uid?: string) => useLive<MyPost[]>(
  db && uid ? () => (cb) => onSnapshot(
    query(collection(db!, 'posts'), where('ownerId', '==', uid)),
    (s) => cb(s.docs
      .map((d) => { const x = d.data(); return { id: d.id, title: String(x.data?.title ?? ''), flow: x.flow, status: String(x.status ?? 'pending'), at: Number(x.createdAt ?? 0), note: String(x.reviewNote ?? ''), kind: String(x.reviewKind ?? '') } as MyPost; })
      .sort((a, b) => b.at - a.at)),
    () => {},
  ) : null, [], [uid]);

export const useMyHelps = (uid?: string) => useLive<MyHelp[]>(
  db && uid ? () => (cb) => onSnapshot(
    collection(db!, 'users', uid, 'helps'),
    (s) => cb(s.docs
      .map((d) => { const x = d.data(); return { id: d.id, title: String(x.title ?? ''), kind: String(x.kind ?? ''), at: Number(x.at ?? 0) } as MyHelp; })
      .sort((a, b) => b.at - a.at)),
    () => {},
  ) : null, [], [uid]);
