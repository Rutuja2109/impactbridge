// Badges and demo certificates, worked out from what the person did in this session plus the sample
// volunteering record. Nothing here is issued by a real organisation; every certificate says so.
import type { IconName } from '../components/Icon';
import { firebaseReady } from '../firebase';
import { campaignOf, myVolunteering, type CauseId } from '../data';
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

type LiveActivity = { posts: { at: number }[]; helps: { at: number }[]; joined: number };
const first = (xs: { at: number }[]) => (xs.length ? Math.min(...xs.map((x) => x.at || Date.now())) : undefined);

/** Badges from what the signed-in person really did: shared a post, offered help, joined a community. Saved with their account. */
export function liveBadges(a: LiveActivity): Badge[] {
  return [
    { id: 'poster', icon: 'heart', earned: a.posts.length > 0, at: first(a.posts) },
    { id: 'helper', icon: 'hand', earned: a.helps.length > 0, at: first(a.helps) },
    { id: 'member', icon: 'people', earned: a.joined > 0 },
  ];
}

/** One certificate for every badge earned. */
export const liveCertificates = (badges: Badge[]): Certificate[] =>
  badges.filter((b) => b.earned).map((b) => ({ id: `b-${b.id}`, kind: 'badge' as const, badge: b.id, at: b.at ?? Date.now() }));
