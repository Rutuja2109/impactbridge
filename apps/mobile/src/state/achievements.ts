// Badges and demo certificates, worked out from what the person did in this session plus the sample
// volunteering record. Nothing here is issued by a real organisation; every certificate says so.
// The installed app uses the second half of this file (liveStats and friends): real activity, tiers, points and levels.
import type { IconName } from '../components/Icon';
import { firebaseReady } from '../firebase';
import { campaignOf, myVolunteering, type CauseId } from '../data';
import type { Give } from './donations';
import type { MyHelp, MyPost } from './mine';
import type { MyDonation, Sip } from './store';

export type Badge = { id: string; icon: IconName; earned: boolean; progress?: [number, number]; at?: number };
export type Certificate =
  | { id: string; kind: 'badge'; badge: string; at: number }
  | { id: string; kind: 'volunteer'; activity: string; hours: number; date: string }
  | { id: string; kind: 'donation'; cid: string; amount: number; monthly: boolean };

type Activity = { myDonations: MyDonation[]; sips: Sip[]; joined: string[]; going: string[]; following: string[] };

export function badgesFor(a: Activity): Badge[] {
  // The installed app has no donations, SIPs, events or sample volunteering: only joining a community can be earned.
  if (firebaseReady) return [{ id: 'member', icon: 'people', earned: a.following.length > 0 }];
  const causes = new Set<CauseId>();
  a.myDonations.forEach((d) => { const c = campaignOf(d.cid); if (c) causes.add(c.cat); });
  a.sips.filter((s) => s.status !== 'cancelled').forEach((s) => causes.add(s.cause));
  const verifiedHours = myVolunteering.filter((v) => v.status === 'verified').reduce((n, v) => n + v.hours, 0);
  return [
    { id: 'first', icon: 'heart', earned: a.myDonations.length > 0 },
    { id: 'sip', icon: 'coin', earned: a.sips.some((s) => s.status === 'active') },
    { id: 'causes', icon: 'chart', earned: causes.size >= 3, progress: [Math.min(3, causes.size), 3] },
    { id: 'hands', icon: 'hand', earned: a.joined.length > 0 },
    { id: 'verified', icon: 'check', earned: verifiedHours > 0 },
    { id: 'member', icon: 'people', earned: a.following.length > 0 },
    { id: 'event', icon: 'bell', earned: a.going.length > 0 },
  ];
}

export function certificatesFor(a: Activity): Certificate[] {
  const vol: Certificate[] = myVolunteering
    .filter((v) => v.status === 'verified')
    .map((v) => ({ id: `v-${v.k}`, kind: 'volunteer', activity: v.k, hours: v.hours, date: v.date }));
  const don: Certificate[] = a.myDonations.map((d, i) => ({ id: `d-${i}`, kind: 'donation', cid: d.cid, amount: d.a, monthly: !!d.monthly }));
  return [...vol, ...don];
}

// ---------------------------------------------------------------------------------------------------------------------
// Installed app: real activity -> points, level, badge tiers (Bronze / Silver / Gold) and certificates.

export type Tier = 0 | 1 | 2 | 3; // 0 = not earned yet
export type LiveBadge = { id: string; icon: IconName; tier: Tier; value: number; tiers: [number, number, number]; at?: number };
export type LiveCert =
  | { id: string; kind: 'tier'; badge: string; tier: 1 | 2 | 3; value: number; at: number }
  | { id: string; kind: 'gift'; title: string; amount: number; at: number }
  | { id: string; kind: 'level'; level: number; points: number; at: number };
export type LiveStats = { posts: MyPost[]; helps: MyHelp[]; joined: number; gives: Give[] };

export const LEVELS = [0, 30, 100, 250, 600]; // points needed for level 0..4
export const TIER_COLOR = ['#C9D1CC', '#B87333', '#8E9AA6', '#E0A800'] as const;
export const TIER_SOFT = ['#EEF0F2', '#F6E7D8', '#E8ECF0', '#FFF3CC'] as const;

const earliest = (xs: { at: number }[]) => (xs.length ? Math.min(...xs.map((x) => x.at || Date.now())) : undefined);

/** Everything the Impact page needs, in one pass. */
export function liveStats(s: LiveStats) {
  const approved = s.posts.filter((p) => p.status === 'approved').length;
  const paid = s.gives.filter((g) => g.status === 'received');
  const rupees = paid.reduce((n, g) => n + g.amount, 0);
  const kinds = [s.posts.length > 0, s.helps.length > 0, paid.length > 0, s.joined > 0].filter(Boolean).length;

  const points = s.posts.length * 10 + approved * 20 + s.helps.length * 15 + paid.reduce((n, g) => n + 20 + Math.floor(g.amount / 100), 0) + s.joined * 10;
  let level = 0;
  LEVELS.forEach((need, i) => { if (points >= need) level = i; });
  const nextNeed = LEVELS[level + 1];

  const def: [string, IconName, number, [number, number, number], number | undefined][] = [
    ['voice', 'heart', s.posts.length, [1, 3, 10], earliest(s.posts)],
    ['trusted', 'check', approved, [1, 3, 10], earliest(s.posts.filter((p) => p.status === 'approved'))],
    ['helper', 'hand', s.helps.length, [1, 5, 15], earliest(s.helps)],
    ['giver', 'coin', paid.length, [1, 3, 10], earliest(paid)],
    ['generous', 'chart', rupees, [500, 2500, 10000], earliest(paid)],
    ['builder', 'people', s.joined, [1, 3, 5], undefined],
    ['allround', 'bell', kinds, [2, 3, 4], undefined],
  ];
  const badges: LiveBadge[] = def.map(([id, icon, value, tiers, at]) => ({
    id, icon, value, tiers, at, tier: (value >= tiers[2] ? 3 : value >= tiers[1] ? 2 : value >= tiers[0] ? 1 : 0) as Tier,
  }));

  const certs: LiveCert[] = [];
  badges.forEach((b) => { if (b.tier > 0) certs.push({ id: `t-${b.id}-${b.tier}`, kind: 'tier', badge: b.id, tier: b.tier as 1 | 2 | 3, value: b.value, at: b.at ?? Date.now() }); });
  paid.forEach((g) => certs.push({ id: `g-${g.id}`, kind: 'gift', title: g.title, amount: g.amount, at: g.confirmedAt ?? g.at }));
  if (level > 0) certs.push({ id: `l-${level}`, kind: 'level', level, points, at: Date.now() });

  return { points, level, nextNeed, prevNeed: LEVELS[level], badges, certs, counts: { posts: s.posts.length, helps: s.helps.length, paidN: paid.length, rupees, joined: s.joined, approved } };
}

/** A short, steady certificate number for one person and one certificate (the same every time it is shown). */
export function certNo(uid: string | undefined, seed: string): string {
  let h = 5381;
  for (const ch of `${uid ?? ''}|${seed}`) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return `GN-${h.toString(36).toUpperCase().padStart(7, '0').slice(-7)}`;
}
