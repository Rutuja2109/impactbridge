// Numbers for the admin dashboard, counted by Firestore itself (no documents are downloaded). Each number loads on its own,
// so one that fails (for example a missing rule) shows as "—" with its error, and the rest still appear.
import { collection, collectionGroup, getAggregateFromServer, getCountFromServer, query, sum, where } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '../firebase';

export type Metrics = Record<string, number | undefined>;
const DAY = 86_400_000;

export function useMetrics(tick: number) {
  const [m, setM] = useState<Metrics | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    const n = (q: Parameters<typeof getCountFromServer>[0]) => () => getCountFromServer(q).then((s) => s.data().count);
    const posts = collection(db!, 'posts');
    const users = collection(db!, 'users');
    const orgs = collection(db!, 'orgs');
    const now = Date.now();
    const jobs: Record<string, () => Promise<number>> = {
      users: n(users), users7: n(query(users, where('createdAt', '>=', now - 7 * DAY))), active7: n(query(users, where('lastSeen', '>=', now - 7 * DAY))),
      posts: n(posts), pending: n(query(posts, where('status', '==', 'pending'))), approved: n(query(posts, where('status', '==', 'approved'))), rejected: n(query(posts, where('status', '==', 'rejected'))),
      problems: n(query(posts, where('flow', '==', 'problem'))), projects: n(query(posts, where('flow', '==', 'project'))), funds: n(query(posts, where('flow', '==', 'fund'))),
      helps: n(collectionGroup(db!, 'responses')), donations: n(collectionGroup(db!, 'donations')),
      money: () => getAggregateFromServer(posts, { t: sum('received') }).then((s) => Number(s.data().t ?? 0)),
      donors: () => getAggregateFromServer(posts, { t: sum('donors') }).then((s) => Number(s.data().t ?? 0)),
      communities: n(collection(db!, 'communities')), members: n(collectionGroup(db!, 'members')),
      orgsVerified: n(query(orgs, where('status', '==', 'verified'))), orgsPending: n(query(orgs, where('status', '==', 'pending'))),
      reports: n(collection(db!, 'reports')),
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
    });
    return () => { live = false; };
  }, [tick]);
  return { m, failed };
}
