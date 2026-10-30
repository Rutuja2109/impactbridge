// Numbers for the admin dashboard, counted by Firestore itself (no documents are downloaded). Each number loads on its own, so one
// that fails (for example a missing rule) shows as "—" with its error and the rest still appear.
// "People who ..." counts use flags the app saves on each person (posted, helped, gave, inCommunity), so they start from the
// first time a person does the thing in this version of the app.
import { collection, collectionGroup, getAggregateFromServer, getCountFromServer, getDocs, limit, query, sum, where } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '../firebase';

export type Metrics = Record<string, number | undefined>;
export type TopCommunity = { id: string; name: string; members: number };
const DAY = 86_400_000;
const CAUSES = ['medical', 'animals', 'education', 'food', 'environment'];

export function useMetrics(tick: number) {
  const [m, setM] = useState<Metrics | null>(null);
  const [top, setTop] = useState<TopCommunity[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  useEffect(() => {
    let live = true;
    const n = (q: Parameters<typeof getCountFromServer>[0]) => () => getCountFromServer(q).then((s) => s.data().count);
    const posts = collection(db!, 'posts');
    const users = collection(db!, 'users');
    const orgs = collection(db!, 'orgs');
    const now = Date.now();
    const midnight = new Date().setHours(0, 0, 0, 0);
    const jobs: Record<string, () => Promise<number>> = {
      users: n(users),
      usersToday: n(query(users, where('createdAt', '>=', midnight))),
      users7: n(query(users, where('createdAt', '>=', now - 7 * DAY))),
      users30: n(query(users, where('createdAt', '>=', now - 30 * DAY))),
      activeToday: n(query(users, where('lastSeen', '>=', midnight))),
      active7: n(query(users, where('lastSeen', '>=', now - 7 * DAY))),
      active30: n(query(users, where('lastSeen', '>=', now - 30 * DAY))),
      posted: n(query(users, where('posted', '==', true))),
      helped: n(query(users, where('helped', '==', true))),
      gave: n(query(users, where('gave', '==', true))),
      inCommunity: n(query(users, where('inCommunity', '==', true))),
      posts: n(posts),
      postsToday: n(query(posts, where('createdAt', '>=', midnight))),
      posts7: n(query(posts, where('createdAt', '>=', now - 7 * DAY))),
      pending: n(query(posts, where('status', '==', 'pending'))),
      approved: n(query(posts, where('status', '==', 'approved'))),
      rejected: n(query(posts, where('status', '==', 'rejected'))),
      problems: n(query(posts, where('flow', '==', 'problem'))),
      projects: n(query(posts, where('flow', '==', 'project'))),
      funds: n(query(posts, where('flow', '==', 'fund'))),
      samples: n(query(posts, where('sample', '==', true))),
      helps: n(collectionGroup(db!, 'responses')),
      donations: n(collectionGroup(db!, 'donations')),
      money: () => getAggregateFromServer(posts, { t: sum('received') }).then((s) => Number(s.data().t ?? 0)),
      donors: () => getAggregateFromServer(posts, { t: sum('donors') }).then((s) => Number(s.data().t ?? 0)),
      communities: n(collection(db!, 'communities')),
      members: n(collectionGroup(db!, 'members')),
      orgsVerified: n(query(orgs, where('status', '==', 'verified'))),
      orgsPending: n(query(orgs, where('status', '==', 'pending'))),
      reports: n(collection(db!, 'reports')),
      ...Object.fromEntries(CAUSES.map((c) => [`cause_${c}`, n(query(posts, where('data.cat', '==', c)))])),
    };
    const keys = Object.keys(jobs);
    Promise.allSettled(keys.map((k) => jobs[k]())).then((res) => {
      if (!live) return;
      const out: Metrics = {};
      const bad: string[] = [];
      res.forEach((r, i) => {
        if (r.status === 'fulfilled') out[keys[i]] = r.value;
        else bad.push(`${keys[i]} (${(r.reason as { code?: string })?.code ?? 'error'})`);
      });
      setM(out);
      setFailed(bad);
      setAt(Date.now());
    });
    // The busiest communities, by number of members.
    getDocs(query(collection(db!, 'communities'), limit(20))).then(async (s) => {
      const rows = await Promise.all(s.docs.map(async (d) => ({ id: d.id, name: String(d.data().name ?? ''), members: (await getCountFromServer(collection(db!, 'communities', d.id, 'members')).then((x) => x.data().count).catch(() => 0)) })));
      if (live) setTop(rows.sort((a, b) => b.members - a.members).slice(0, 5));
    }).catch(() => {});
    return () => { live = false; };
  }, [tick]);
  return { m, top, failed, at };
}
