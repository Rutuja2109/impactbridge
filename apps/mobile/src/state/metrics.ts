// Numbers for the admin dashboard, counted by Firestore itself (no documents are downloaded).
import { collection, collectionGroup, getAggregateFromServer, getCountFromServer, query, sum, where } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '../firebase';

export type Metrics = Record<string, number>;
const DAY = 86_400_000;

export function useMetrics(tick: number) {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    const n = (q: Parameters<typeof getCountFromServer>[0]) => getCountFromServer(q).then((s) => s.data().count);
    const posts = collection(db!, 'posts');
    const users = collection(db!, 'users');
    const orgs = collection(db!, 'orgs');
    const now = Date.now();
    Promise.all([
      n(users), n(query(users, where('createdAt', '>=', now - 7 * DAY))), n(query(users, where('lastSeen', '>=', now - 7 * DAY))),
      n(posts), n(query(posts, where('status', '==', 'pending'))), n(query(posts, where('status', '==', 'approved'))), n(query(posts, where('status', '==', 'rejected'))),
      n(query(posts, where('flow', '==', 'problem'))), n(query(posts, where('flow', '==', 'project'))), n(query(posts, where('flow', '==', 'fund'))),
      n(collectionGroup(db!, 'responses')), n(collectionGroup(db!, 'donations')),
      getAggregateFromServer(posts, { money: sum('received'), donors: sum('donors') }).then((s) => s.data()),
      n(collection(db!, 'communities')), n(collectionGroup(db!, 'members')),
      n(query(orgs, where('status', '==', 'verified'))), n(query(orgs, where('status', '==', 'pending'))),
      n(collection(db!, 'reports')),
    ]).then(([u, u7, a7, p, pp, pa, pr, f1, f2, f3, help, don, agg, com, mem, ov, op, rep]) => {
      if (live) setM({ users: u, users7: u7, active7: a7, posts: p, pending: pp, approved: pa, rejected: pr, problems: f1, projects: f2, funds: f3, helps: help, donations: don, money: Number(agg.money ?? 0), donors: Number(agg.donors ?? 0), communities: com, members: mem, orgsVerified: ov, orgsPending: op, reports: rep });
    }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [tick]);
  return { m, err };
}
