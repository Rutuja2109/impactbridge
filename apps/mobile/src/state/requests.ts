// Help requests for the person's own posts: everyone who tapped "I can help" (time or items) on a post they shared. Read live from each
// of their approved posts' offers, newest first. The number on the Home bell counts requests that arrived after the person last
// opened the list, and a short message appears while the app is open when a new one comes in. A phone notification when the app is
// closed needs the server-side function in firebase/functions (onHelpOffered).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, onSnapshot, updateDoc } from '@react-native-firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { db } from '../firebase';
import { useMyPosts } from './mine';

export type HelpRequest = { id: string; postId: string; postTitle: string; uid: string; name: string; email: string; kind: 'volunteer' | 'items'; at: number; status: 'new' | 'contacted' };

const KEY = 'gn-requests-seen';
let seenAt = 0;
let loaded = false;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

async function loadSeen() {
  if (loaded) return;
  loaded = true;
  try {
    const v = await AsyncStorage.getItem(KEY);
    seenAt = v ? Number(v) || 0 : 0; // a new install flags existing requests once, so nothing is missed
  } catch { seenAt = 0; }
  ping();
}

/** Called when the person opens their requests: everything shown so far counts as seen. */
export function markRequestsSeen() {
  seenAt = Date.now();
  AsyncStorage.setItem(KEY, String(seenAt)).catch(() => undefined);
  ping();
}

/** The person marks that they have been in touch with a helper. */
export const markContacted = (postId: string, uid: string) => updateDoc(doc(db!, 'posts', postId, 'responses', uid), { status: 'contacted', contactedAt: Date.now() });

export function useHelpRequests(uid?: string) {
  const posts = useMyPosts(uid);
  const live = useMemo(() => posts.filter((p) => p.status === 'approved'), [posts]);
  const [byPost, setByPost] = useState<Record<string, HelpRequest[]>>({});
  const [, force] = useState(0);

  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    loadSeen();
    return () => { subs.delete(f); };
  }, []);

  const key = live.map((p) => p.id).join(',');
  useEffect(() => {
    if (!db || !uid) { setByPost({}); return undefined; }
    const stops = live.map((p) => onSnapshot(
      collection(db!, 'posts', p.id, 'responses'),
      (s) => setByPost((all) => ({
        ...all,
        [p.id]: s.docs.map((d) => {
          const x = d.data();
          return { id: `${p.id}-${d.id}`, postId: p.id, postTitle: p.title, uid: d.id, name: String(x.name ?? ''), email: String(x.email ?? ''), kind: x.kind === 'items' ? 'items' : 'volunteer', at: Number(x.at ?? 0), status: x.status === 'contacted' ? 'contacted' : 'new' } as HelpRequest;
        }),
      })),
      () => undefined,
    ));
    return () => stops.forEach((s) => s());
  }, [key, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => Object.entries(byPost).filter(([id]) => live.some((p) => p.id === id)).flatMap(([, v]) => v).sort((a, b) => b.at - a.at), [byPost, live]);
  const fresh = items.filter((r) => r.status === 'new').length;
  return { items, waiting: fresh, unread: loaded ? items.filter((r) => r.at > seenAt && r.status === 'new').length : 0 };
}
