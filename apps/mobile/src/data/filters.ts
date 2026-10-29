// Discover filters: what a neighbour needs to narrow things down. Projects can be filtered by the kind of help
// wanted (money, volunteers, items or skills), status, area, time left and verified results; fundraisers by
// verification, who is raising, urgency and time left. Everything runs on the local sample data.
import { campaignReceived, projects, type Campaign, type Donation, type Project } from './index';

export type Help = 'money' | 'vols' | 'items';
export type Sort = 'relevant' | 'urgent' | 'nearly' | 'most';
export type Filters = {
  sort: Sort;
  help: Help[]; status: Project['status'][]; area: string[]; verified: boolean; // projects
  verify: Campaign['verify'][]; who: Campaign['type'][]; urgent: boolean; // fundraisers
  within: 0 | 7 | 14 | 30; // days left, both (0 = any)
  money: [number, number]; // amount still needed, both; max === MONEY_MAX means no upper limit
};
export const MONEY_MAX = 100000;
export const NO_FILTERS: Filters = { sort: 'relevant', help: [], status: [], area: [], verified: false, verify: [], who: [], urgent: false, within: 0, money: [0, MONEY_MAX] };
export const moneyOn = (f: Filters) => f.money[0] > 0 || f.money[1] < MONEY_MAX;
const inMoney = (f: Filters, need: number) => !moneyOn(f) || (need >= f.money[0] && (f.money[1] >= MONEY_MAX || need <= f.money[1]));

export const areas = [...new Set(projects.map((p) => p.area))].sort();

/** Which kinds of help a project still wants. */
export function helpOf(p: Project): Help[] {
  const out: Help[] = [];
  if (p.goal - p.raised > 0) out.push('money');
  if (p.volsNeeded - p.vols > 0) out.push('vols');
  if (p.needs.some((n) => !/volunteer/i.test(n))) out.push('items');
  return out;
}

const hasAny = <T,>(picked: T[], have: T[]) => !picked.length || have.some((h) => picked.includes(h));
const pct = (n: number, of: number) => n / of;

export function filterProjects(list: Project[], f: Filters): Project[] {
  const out = list.filter((p) =>
    hasAny(f.help, helpOf(p)) && hasAny(f.status, [p.status]) && hasAny(f.area, [p.area]) &&
    (!f.within || (p.status !== 'Completed' && p.days <= f.within)) && (!f.verified || !!p.verified) && inMoney(f, p.goal - p.raised));
  if (f.sort === 'urgent') out.sort((a, b) => a.days - b.days);
  if (f.sort === 'nearly') out.sort((a, b) => pct(b.raised, b.goal) - pct(a.raised, a.goal));
  if (f.sort === 'most') out.sort((a, b) => (b.volsNeeded - b.vols) - (a.volsNeeded - a.vols));
  return out;
}

export function filterCampaigns(list: Campaign[], f: Filters, donations: Record<string, Donation[]>): Campaign[] {
  const out = list.filter((c) =>
    hasAny(f.verify, [c.verify]) && hasAny(f.who, [c.type]) && (!f.urgent || !!c.urgent) && (!f.within || c.days <= f.within) && inMoney(f, c.goal - campaignReceived(c, donations[c.id])));
  const done = (c: Campaign) => pct(campaignReceived(c, donations[c.id]), c.goal);
  if (f.sort === 'urgent') out.sort((a, b) => a.days - b.days);
  if (f.sort === 'nearly') out.sort((a, b) => done(b) - done(a));
  if (f.sort === 'most') out.sort((a, b) => b.base.donors - a.base.donors);
  return out;
}

/** How many filters are switched on (sorting is not counted). */
export function activeCount(f: Filters, fund: boolean): number {
  return fund
    ? f.verify.length + f.who.length + (f.urgent ? 1 : 0) + (f.within ? 1 : 0) + (moneyOn(f) ? 1 : 0)
    : f.help.length + f.status.length + f.area.length + (f.verified ? 1 : 0) + (f.within ? 1 : 0) + (moneyOn(f) ? 1 : 0);
}
