// Help tickets. When a neighbour offers time or items on a post, the offer becomes a ticket that both people can follow, like an issue
// tracker: a status (Open, In progress, Done, Declined, Withdrawn), an activity thread where either side can write and the organiser
// can share contact details, and an alert for the other person whenever something changes.
//
// A ticket is the document posts/{postId}/responses/{helperUid} plus its comments subcollection. The latest activity (lastBy, lastAt,
// lastText) is copied onto the ticket itself so lists and counts need no extra reads.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch } from '@react-native-firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { db } from '../firebase';
import type { User } from '../screens/Welcome';
import { useLive } from './communities';
import { useMyPosts } from './mine';

export type TicketStatus = 'requested' | 'accepted' | 'completed' | 'declined' | 'withdrawn';
export type Ticket = {
  id: string; postId: string; helperUid: string; postTitle: string; ownerId: string; ownerName: string;
  name: string; email: string; phone: string; kind: 'volunteer' | 'items'; qty: number; hours: number; what: string; when: string;
  status: TicketStatus; at: number; statusAt: number; lastBy: string; lastAt: number; lastText: string;
};
export type Activity = { id: string; type: 'comment' | 'status' | 'contact'; by: string; byName: string; text: string; from?: string; to?: string; at: number };

/** Jira-style names and colours. The first line is what people see; `next` lists who can move it where. */
export const STATUS: Record<TicketStatus, { key: string; tone: 'grey' | 'blue' | 'green' | 'red' }> = {
  requested: { key: 'tk.st.requested', tone: 'blue' },
  accepted: { key: 'tk.st.accepted', tone: 'blue' },
  completed: { key: 'tk.st.completed', tone: 'green' },
  declined: { key: 'tk.st.declined', tone: 'red' },
  withdrawn: { key: 'tk.st.withdrawn', tone: 'grey' },
};
/** What the organiser can do from each status, and what the helper can do. */
export const OWNER_MOVES: Record<TicketStatus, TicketStatus[]> = { requested: ['accepted', 'declined'], accepted: ['completed', 'declined'], completed: ['requested'], declined: ['requested'], withdrawn: [] };
export const HELPER_MOVES: Record<TicketStatus, TicketStatus[]> = { requested: ['withdrawn'], accepted: ['withdrawn'], completed: [], declined: [], withdrawn: [] };

export const ticketRef = (postId: string, helperUid: string) => {
  let h = 5381;
  for (const ch of `${postId}|${helperUid}`) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return `GN-${h.toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
};

const OLD: Record<string, TicketStatus> = { new: 'requested', contacted: 'accepted' }; // offers made before tickets existed

export function toTicket(postId: string, helperUid: string, x: Record<string, unknown>, post?: { title?: string; ownerId?: string; ownerName?: string }): Ticket {
  const raw = String(x.status ?? 'requested');
  const at = Number(x.at ?? 0);
  return {
    id: `${postId}_${helperUid}`, postId, helperUid,
    postTitle: String(x.postTitle ?? post?.title ?? ''), ownerId: String(x.ownerId ?? post?.ownerId ?? ''), ownerName: String(x.ownerName ?? post?.ownerName ?? ''),
    name: String(x.name ?? ''), email: String(x.email ?? ''), phone: String(x.phone ?? ''),
    kind: x.kind === 'items' ? 'items' : 'volunteer', qty: Number(x.qty ?? 1), hours: Number(x.hours ?? 0), what: String(x.what ?? ''), when: String(x.when ?? ''),
    status: (OLD[raw] ?? (raw in STATUS ? raw : 'requested')) as TicketStatus, at, statusAt: Number(x.statusAt ?? at),
    lastBy: String(x.lastBy ?? helperUid), lastAt: Number(x.lastAt ?? at), lastText: String(x.lastText ?? ''),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Opening a ticket

export type OfferInput = { kind: 'volunteer' | 'items'; qty: number; hours: number; what: string; when: string; phone: string };

/** The helper submits the form: creates the ticket, the helper's own record and the first line of the activity thread. Returns the ticket. */
export async function openTicket(u: User, postId: string, input: OfferInput): Promise<Ticket> {
  const post = (await getDoc(doc(db!, 'posts', postId))).data() ?? {};
  const title = String(post.data?.title ?? '');
  const at = Date.now();
  const fields = {
    kind: input.kind, qty: input.qty, hours: input.hours, what: input.what, when: input.when, phone: input.phone,
    name: u.name, email: u.email, postTitle: title, ownerId: String(post.ownerId ?? ''), ownerName: String(post.ownerName ?? ''),
    status: 'requested', at, statusAt: at, lastBy: u.uid, lastAt: at, lastText: input.what,
  };
  const b = writeBatch(db!);
  b.set(doc(db!, 'posts', postId, 'responses', u.uid!), fields);
  b.set(doc(db!, 'users', u.uid!, 'helps', postId), { kind: input.kind, title, at }); // behind the helper's badges and certificates
  b.set(doc(db!, 'users', u.uid!), { helped: true }, { merge: true });
  await b.commit();
  await addDoc(collection(db!, 'posts', postId, 'responses', u.uid!, 'activity'), { type: 'status', by: u.uid, byName: u.name, text: '', from: '', to: 'requested', at });
  return toTicket(postId, u.uid!, fields);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Working on a ticket

const bump = (u: User, text: string, extra: Record<string, unknown> = {}) => ({ lastBy: u.uid, lastAt: Date.now(), lastText: text.slice(0, 120), ...extra });

/** Either person writes a comment. The organiser's "contact" type is a comment that shares how to reach them. */
export async function addActivity(u: User, t: Ticket, type: 'comment' | 'contact', text: string) {
  const at = Date.now();
  await addDoc(collection(db!, 'posts', t.postId, 'responses', t.helperUid, 'activity'), { type, by: u.uid, byName: u.name, text, at });
  await updateDoc(doc(db!, 'posts', t.postId, 'responses', t.helperUid), bump(u, text));
}

/** Moves the ticket to a new status and records it in the thread. */
export async function moveTicket(u: User, t: Ticket, to: TicketStatus) {
  const at = Date.now();
  await updateDoc(doc(db!, 'posts', t.postId, 'responses', t.helperUid), { status: to, statusAt: at, ...bump(u, '') });
  await addDoc(collection(db!, 'posts', t.postId, 'responses', t.helperUid, 'activity'), { type: 'status', by: u.uid, byName: u.name, text: '', from: t.status, to, at });
}

/** Live activity thread of one ticket, oldest first. */
export const useActivity = (t: Ticket | null) => useLive<Activity[]>(db && t ? () => (cb) => onSnapshot(
  query(collection(db!, 'posts', t.postId, 'responses', t.helperUid, 'activity'), orderBy('at', 'asc')),
  (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Activity, 'id'>) }))),
  () => cb([]),
) : null, [], [t?.id]);

/** Live copy of one ticket (so the status on screen changes the moment the other person changes it). */
export const useTicket = (seed: Ticket) => useLive<Ticket>(db ? () => (cb) => onSnapshot(
  doc(db!, 'posts', seed.postId, 'responses', seed.helperUid),
  (s) => { if (s.exists()) cb(toTicket(seed.postId, seed.helperUid, s.data() ?? {}, { title: seed.postTitle, ownerId: seed.ownerId, ownerName: seed.ownerName })); },
  () => undefined,
) : null, seed, [seed.id]);

// ---------------------------------------------------------------------------------------------------------------------------------
// Lists and alerts

const KEY = 'gn-requests-seen';
let seenAt = 0;
let loaded = false;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

async function loadSeen() {
  if (loaded) return;
  loaded = true;
  try { seenAt = Number((await AsyncStorage.getItem(KEY)) ?? 0) || 0; } catch { seenAt = 0; }
  ping();
}

/** Called when the person opens their tickets: everything shown so far counts as seen. */
export function markRequestsSeen() {
  seenAt = Date.now();
  AsyncStorage.setItem(KEY, String(seenAt)).catch(() => undefined);
  ping();
}

function useSeen() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    loadSeen();
    return () => { subs.delete(f); };
  }, []);
  return loaded ? seenAt : Number.MAX_SAFE_INTEGER;
}

const waitingFor = (list: Ticket[], me: string, role: 'owner' | 'helper') => list.filter((t) => (role === 'owner' ? t.status === 'requested' : t.lastBy !== me && t.status !== 'withdrawn' && t.status !== 'completed' && t.status !== 'declined')).length;

/** Tickets on the person's own approved posts (they are the organiser), newest activity first. */
export function useHelpRequests(uid?: string) {
  const posts = useMyPosts(uid);
  const live = useMemo(() => posts.filter((p) => p.status === 'approved'), [posts]);
  const [byPost, setByPost] = useState<Record<string, Ticket[]>>({});
  const seen = useSeen();

  const key = live.map((p) => p.id).join(',');
  useEffect(() => {
    if (!db || !uid) { setByPost({}); return undefined; }
    const stops = live.map((p) => onSnapshot(
      collection(db!, 'posts', p.id, 'responses'),
      (s) => setByPost((all) => ({ ...all, [p.id]: s.docs.map((d) => toTicket(p.id, d.id, d.data() ?? {}, { title: p.title, ownerId: uid })) })),
      () => undefined,
    ));
    return () => stops.forEach((s) => s());
  }, [key, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => Object.entries(byPost).filter(([id]) => live.some((p) => p.id === id)).flatMap(([, v]) => v).sort((a, b) => b.lastAt - a.lastAt), [byPost, live]);
  return { items, waiting: waitingFor(items, uid ?? '', 'owner'), unread: items.filter((t) => t.lastBy !== uid && t.lastAt > seen).length };
}

/** Tickets the person opened on other people's posts (they are the helper), newest activity first. */
export function useMyTickets(uid?: string) {
  const [helps, setHelps] = useState<string[]>([]);
  const [byPost, setByPost] = useState<Record<string, Ticket>>({});
  const seen = useSeen();

  useEffect(() => {
    if (!db || !uid) { setHelps([]); return undefined; }
    return onSnapshot(collection(db!, 'users', uid, 'helps'), (s) => setHelps(s.docs.map((d) => d.id)), () => undefined);
  }, [uid]);

  const key = helps.join(',');
  useEffect(() => {
    if (!db || !uid) { setByPost({}); return undefined; }
    const stops = helps.map((pid) => onSnapshot(
      doc(db!, 'posts', pid, 'responses', uid),
      (s) => { if (s.exists()) setByPost((all) => ({ ...all, [pid]: toTicket(pid, uid, s.data() ?? {}) })); },
      () => undefined,
    ));
    return () => stops.forEach((s) => s());
  }, [key, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => Object.values(byPost).filter((t) => helps.includes(t.postId)).sort((a, b) => b.lastAt - a.lastAt), [byPost, helps]);
  return { items, waiting: waitingFor(items, uid ?? '', 'helper'), unread: items.filter((t) => t.lastBy !== uid && t.lastAt > seen).length };
}
