// Typed access to the prototype's sample data (demo.generated.ts) plus the same calculations the prototype uses.
// Everything here is fictional demonstration content. Nothing is fetched or verified.
import { firebaseReady } from '../firebase';
import { DEMO } from './demo.generated';

export type CauseId = 'medical' | 'animals' | 'education' | 'food' | 'environment';
export type Category = { id: CauseId; color: string; soft: string };

export type Project = {
  id: string; cat: CauseId; title: string; org: string; area: string;
  status: 'Open' | 'In progress' | 'Completed'; verified?: boolean;
  raised: number; goal: number; received: number; vols: number; volsNeeded: number; hours: number; days: number;
  x: number; y: number; lat?: number; lng?: number; at?: number; ownerId?: string; desc: string; needs: string[];
};
export type Org = { id: string; name: string; type: string; area: string; members: number; projects: number; about: string };
export type Opportunity = { id: string; title: string; org: string; when: string; spots: number; skill: string };
export type CommunityEvent = { id: string; date: string; title: string; place: string; time: string; going: number };
export type Outcome = { k: string; reported: number; verified: number };
export type Donation = { n: string; a: number; m: string; s: 'received' | 'pledged'; mine?: boolean };
export type Campaign = {
  id: string; type: 'individual' | 'org'; cat: CauseId; org: string | null; urgent?: boolean; featured?: boolean;
  verify: 'docs' | 'pending' | 'unverified'; goal: number; days: number; x: number; y: number; lat?: number; lng?: number; at?: number; ownerId?: string; use?: string;
  title: string; short: string; story: string; beneficiary: string; benAbout: string; organizer: string;
  base: { received: number; donors: number };
  updates: { ago: number; text: string }[];
  /** Where the organiser accepts money (their own UPI / payment page). The app never handles money. */
  payLink?: string;
  funds: { label: string; amount: number }[];
  donations: Donation[];
};
export type Story = { id: string; cat: CauseId };
export type VolunteerActivity = { k: string; date: string; hours: number; status: 'verified' | 'reported' };

type DemoData = {
  contentLang: 'en';
  categories: Category[]; projects: Project[]; orgs: Org[]; opportunities: Opportunity[]; events: CommunityEvent[];
  impact: { outcomes: Outcome[] }; campaigns: Campaign[]; stories: Story[]; myVolunteering: VolunteerActivity[];
};

const sample = DEMO as unknown as DemoData;
// In the installed app (Firebase configured) there is no sample content: these lists start empty and are filled in place
// from approved posts by applyLive(). Without Firebase (Expo Go) the fictional prototype data is used, as before.
export const demo: DemoData = firebaseReady
  ? { ...sample, projects: [], orgs: [], opportunities: [], events: [], campaigns: [], stories: [], myVolunteering: [], impact: { outcomes: [] } }
  : sample;
export const { categories, projects, orgs, opportunities, events, campaigns, stories, myVolunteering } = demo;
export const outcomes = demo.impact.outcomes;
export const contentLang = demo.contentLang;

// Darker text colours for each cause on its light background (4.5:1 or better); same hues as the prototype.
const INK: Record<CauseId, string> = { medical: '#B4262C', animals: '#8A5300', education: '#2E4BB8', food: '#A84A06', environment: '#0B6B4F' };
export const causeInk = (id: CauseId) => INK[id];
export const catOf = (id: CauseId): Category => categories.find((c) => c.id === id) ?? categories[0];
export const orgOf = (id: string | null) => orgs.find((o) => o.id === id);
export const projectOf = (id: string) => projects.find((p) => p.id === id);
export const campaignOf = (id: string) => campaigns.find((c) => c.id === id);
export const fundsOfOrg = (orgId: string) => campaigns.filter((c) => c.org === orgId);

// Projects: pledged vs received are separate; received never exceeds what was confirmed.
const ratio = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
export const pledgedPct = (p: Project) => ratio(p.raised, p.goal);
export const receivedPct = (p: Project) => ratio(p.received, p.goal);

// Campaigns: only donations marked received count; pledges stay separate until the (simulated) organiser confirms.
// `donations` comes from app state so demo donations and confirmations made in this session are included.
export const campaignReceived = (c: Campaign, donations: Donation[] = []) =>
  c.base.received + donations.filter((d) => d.s === 'received').reduce((a, d) => a + d.a, 0);
export const campaignPledged = (donations: Donation[] = []) =>
  donations.filter((d) => d.s === 'pledged').reduce((a, d) => a + d.a, 0);
export const campaignSupporters = (c: Campaign, donations: Donation[] = []) => c.base.donors + donations.length;
export const fundPct = (c: Campaign, donations: Donation[] = []) => Math.min(100, Math.round((campaignReceived(c, donations) / c.goal) * 100));
export const pledgePct = (c: Campaign, donations: Donation[] = []) =>
  Math.min(100 - fundPct(c, donations), Math.round((campaignPledged(donations) / c.goal) * 100));

/** What an approved post document looks like in Firestore (written by the post forms, approved by an admin). */
export type PostDoc = { id: string; flow: 'problem' | 'project' | 'fund'; data: Record<string, unknown>; ownerId?: string; createdAt?: number; received?: number; donors?: number; thumb?: string; reviewedAt?: number };

const num = (v: unknown) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const coord = (v: unknown, max: number) => { const n = typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) && Math.abs(n) <= max && v !== '' ? n : undefined; };
const daysLeft = (iso: string) => { const t = Date.parse(iso); return Number.isNaN(t) ? 30 : Math.max(0, Math.ceil((t - Date.now()) / 86400000)); };
// The map is illustrative: pins get a stable spot from the post id (no real coordinates are collected).
const spot = (id: string, k: number) => 12 + ([...id].reduce((a, c) => (a * 31 + c.charCodeAt(0) + k) % 997, 7) % 76);

/** Replace the lists with the approved posts. Arrays are updated in place because modules hold references to them. */
/** Small cover picture of each live post (base64 JPEG), filled by applyLive. */
export const thumbs: Record<string, string> = {};

export function applyLive(posts: PostDoc[]) {
  const proj: Project[] = [];
  const camp: Campaign[] = [];
  for (const k of Object.keys(thumbs)) delete thumbs[k];
  for (const p of posts) {
    if (p.thumb) thumbs[p.id] = p.thumb;
    const d = p.data;
    const cat = (categories.some((c) => c.id === d.cat) ? d.cat : 'medical') as CauseId;
    if (p.flow === 'fund') {
      camp.push({
        id: p.id, type: d.ctype === 'org' ? 'org' : 'individual', cat, org: null, urgent: false, featured: false,
        verify: 'unverified', goal: num(d.goal) || 1000, days: daysLeft(str(d.deadline)), x: spot(p.id, 1), y: spot(p.id, 2), lat: coord(d.lat, 90), lng: coord(d.lng, 180), at: p.reviewedAt ?? p.createdAt, ownerId: p.ownerId,
        title: str(d.title), short: str(d.story).slice(0, 120), story: str(d.story), beneficiary: str(d.benName), benAbout: str(d.benAbout),
        organizer: str(d.display), base: { received: p.received ?? 0, donors: p.donors ?? 0 }, updates: [], funds: [], donations: [],
        payLink: str(d.payLink) || undefined, use: str(d.use),
      });
    } else {
      proj.push({
        id: p.id, cat, title: str(d.title), org: '', area: str(d.city), status: 'Open', verified: false,
        raised: 0, goal: num(d.budget), received: 0, vols: 0, volsNeeded: num(d.vols), hours: 0, days: daysLeft(str(d.target)),
        x: spot(p.id, 3), y: spot(p.id, 4), lat: coord(d.lat, 90), lng: coord(d.lng, 180), at: p.reviewedAt ?? p.createdAt, ownerId: p.ownerId, desc: str(d.desc) || str(d.help),
        needs: [str(d.help)].filter(Boolean),
      });
    }
  }
  projects.splice(0, projects.length, ...proj);
  campaigns.splice(0, campaigns.length, ...camp);
}
