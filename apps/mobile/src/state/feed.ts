// "New in GoodNeighbour": every approved post and every new community, newest first, except the person's own. It is built from the
// data the app already keeps live, so it works without any server. The number on the Home bell counts items that appeared after
// the person last opened the list. While the app is open a short message also appears when something new arrives; a phone
// notification when the app is closed needs the server-side function (see firebase/functions).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';

import { campaigns, projects } from '../data';
import { useCommunities } from './communities';
import { useStore } from './store';

export type FeedItem = { id: string; kind: 'project' | 'campaign' | 'community'; title: string; sub: string; at: number };

const KEY = 'gn-feed-seen';
let seenAt = 0;
let loaded = false;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

async function loadSeen() {
  if (loaded) return;
  loaded = true;
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v) seenAt = Number(v) || Date.now();
    else { seenAt = Date.now(); await AsyncStorage.setItem(KEY, String(seenAt)); } // a new install does not flag the old history
  } catch { seenAt = Date.now(); }
  ping();
}

/** Called when the person opens the list: everything shown so far counts as seen. */
export function markFeedSeen() {
  seenAt = Date.now();
  AsyncStorage.setItem(KEY, String(seenAt)).catch(() => undefined);
  ping();
}

export function useFeed(uid?: string) {
  const { dataVersion } = useStore();
  const communities = useCommunities();
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    loadSeen();
    return () => { subs.delete(f); };
  }, []);

  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [
      ...projects.filter((p) => !uid || p.ownerId !== uid).map((p) => ({ id: p.id, kind: 'project' as const, title: p.title, sub: p.area, at: p.at ?? 0 })),
      ...campaigns.filter((c) => !uid || c.ownerId !== uid).map((c) => ({ id: c.id, kind: 'campaign' as const, title: c.title, sub: c.organizer, at: c.at ?? 0 })),
      ...communities.filter((c) => !uid || c.ownerId !== uid).map((c) => ({ id: c.id, kind: 'community' as const, title: c.name, sub: c.orgName, at: c.createdAt ?? 0 })),
    ];
    return out.sort((a, b) => b.at - a.at).slice(0, 30);
  }, [dataVersion, communities, uid]);

  return { items, unread: loaded ? items.filter((i) => i.at > seenAt).length : 0 };
}
