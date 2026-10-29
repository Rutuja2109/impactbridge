// Communities in Firestore. Only an organisation an admin has marked verified (orgs/{uid}.verified, set in the Firebase
// console) can create one; the security rules enforce that, the app only mirrors it. Anyone signed in can join.
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '../firebase';
import type { User } from '../screens/Welcome';

export type Community = { id: string; name: string; desc: string; city: string; ownerId: string; orgName: string; memberCount: number };
export type Org = { orgName: string; status: 'pending' | 'verified' | 'rejected'; verified: boolean };
export type Member = { uid: string; name: string };

/** Live Firestore data, or `fallback` until the first snapshot (and always when Firebase is not configured). */
function useLive<T>(make: (() => (cb: (v: T) => void) => () => void) | null, fallback: T, deps: unknown[]): T {
  const [v, setV] = useState<T>(fallback);
  useEffect(() => { setV(fallback); return make ? make()(setV) : undefined; }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export const useCommunities = () => useLive<Community[]>(db ? () => (cb) => onSnapshot(query(collection(db!, 'communities'), orderBy('createdAt', 'desc')), (s) => cb(s.docs.map((d) => ({ memberCount: 0, ...d.data(), id: d.id }) as Community)), () => {}) : null, [], []);
export const useOrg = (uid?: string) => useLive<Org | null | undefined>(db && uid ? () => (cb) => onSnapshot(doc(db!, 'orgs', uid), (s) => cb(s.exists() ? (s.data() as Org) : null), () => cb(null)) : null, undefined, [uid]);
export const useJoined = (uid?: string) => useLive<string[]>(db && uid ? () => (cb) => onSnapshot(doc(db!, 'users', uid), (s) => cb((s.data()?.joined as string[]) ?? []), () => {}) : null, [], [uid]);
export const useMembers = (cid: string | null, uid?: string) => useLive<Member[]>(db && cid && uid ? () => (cb) => onSnapshot(collection(db!, 'communities', cid, 'members'), (s) => cb(s.docs.map((d) => ({ uid: d.id, name: d.data().name }))), () => {}) : null, [], [cid, uid]);

export const applyOrg = (u: User, data: { orgName: string; kind: string; regNo: string; contact: string }) =>
  setDoc(doc(db!, 'orgs', u.uid!), { ...data, ownerEmail: u.email, verified: false, status: 'pending', at: Date.now() });

export const createCommunity = (u: User, orgName: string, data: { name: string; desc: string; city: string }) =>
  addDoc(collection(db!, 'communities'), { ...data, ownerId: u.uid, orgName, memberCount: 0, createdAt: Date.now() });

export async function setJoined(u: User, cid: string, on: boolean) {
  const b = writeBatch(db!);
  const member = doc(db!, 'communities', cid, 'members', u.uid!);
  if (on) b.set(member, { name: u.name, at: Date.now() }); else b.delete(member);
  b.set(doc(db!, 'users', u.uid!), { joined: on ? arrayUnion(cid) : arrayRemove(cid) }, { merge: true });
  await b.commit();
}

export const removeCommunity = (cid: string) => deleteDoc(doc(db!, 'communities', cid));
