// Typed access to the prototype's sample data (demo.generated.ts) plus the same calculations the prototype uses.
// Everything here is fictional demonstration content. Nothing is fetched or verified.
import { DEMO } from './demo.generated';

export type CauseId = 'medical' | 'animals' | 'education' | 'food' | 'environment';
export type Category = { id: CauseId; color: string; soft: string };

export type Project = {
  id: string; cat: CauseId; title: string; org: string; area: string;
  status: 'Open' | 'In progress' | 'Completed'; verified?: boolean;
  raised: number; goal: number; received: number; vols: number; volsNeeded: number; hours: number; days: number;
  x: number; y: number; desc: string; needs: string[];
};
export type Org = { id: string; name: string; type: string; area: string; members: number; projects: number; about: string };
export type Opportunity = { id: string; title: string; org: string; when: string; spots: number; skill: string };
export type CommunityEvent = { id: string; date: string; title: string; place: string; time: string; going: number };
export type Outcome = { k: string; reported: number; verified: number };
export type Donation = { n: string; a: number; m: string; s: 'received' | 'pledged'; mine?: boolean };
export type Campaign = {
  id: string; type: 'individual' | 'org'; cat: CauseId; org: string | null; urgent?: boolean; featured?: boolean;
  verify: 'docs' | 'pending' | 'unverified'; goal: number; days: number; x: number; y: number;
  title: string; short: string; story: string; beneficiary: string; benAbout: string; organizer: string;
  base: { received: number; donors: number };
  updates: { ago: number; text: string }[];
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

export const demo = DEMO as unknown as DemoData;
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
export const pledgedPct = (p: Project) => Math.min(100, Math.round((p.raised / p.goal) * 100));
export const receivedPct = (p: Project) => Math.min(100, Math.round((p.received / p.goal) * 100));

// Campaigns: only donations marked received count; pledges stay separate until the (simulated) organiser confirms.
// `donations` comes from app state so demo donations and confirmations made in this session are included.
export const campaignReceived = (c: Campaign, donations: Donation[]) =>
  c.base.received + donations.filter((d) => d.s === 'received').reduce((a, d) => a + d.a, 0);
export const campaignPledged = (donations: Donation[]) =>
  donations.filter((d) => d.s === 'pledged').reduce((a, d) => a + d.a, 0);
export const campaignSupporters = (c: Campaign, donations: Donation[]) => c.base.donors + donations.length;
export const fundPct = (c: Campaign, donations: Donation[]) => Math.min(100, Math.round((campaignReceived(c, donations) / c.goal) * 100));
export const pledgePct = (c: Campaign, donations: Donation[]) =>
  Math.min(100 - fundPct(c, donations), Math.round((campaignPledged(donations) / c.goal) * 100));
