// The three post flows from the prototype (report a problem, create a community project, start a fundraiser):
// field specs, validation rules and blank drafts. Pure functions, so the screen only renders and the rules
// stay identical to the approved prototype. Specs are [field name, kind, required].
export type Flow = 'problem' | 'project' | 'fund';
export type Attach = { name: string; size: number };
export type Value = string | boolean | Attach[];
export type PostData = Record<string, Value>;
export type PostState = { step: number; max: number; mode: 'form' | 'review' | 'done'; data: PostData; errors: Record<string, string>; fromReview: boolean; ref: string; restored: boolean };
export type Spec = [name: string, kind: string, required: 0 | 1];

const PROBLEM_STEPS: Record<number, Spec[]> = {
  1: [['title', 'text', 1], ['cat', 'cats', 1], ['desc', 'area', 1], ['help', 'area', 1]],
  2: [['city', 'text', 1], ['area', 'text', 0], ['affected', 'text', 1], ['count', 'num', 0], ['landmark', 'pin', 0]],
  3: [['files', 'files', 0], ['started', 'date', 0], ['urgency', 'urg', 1], ['ongoing', 'ongoing', 0], ['actions', 'area', 0]],
  4: [['outcome', 'area', 1], ['vols', 'num', 0], ['skills', 'text', 0], ['materials', 'text', 0], ['budget', 'num', 0], ['target', 'date', 0], ['partners', 'text', 0]],
  5: [['who', 'who', 1], ['orgName', 'text', 1], ['contact', 'contact', 1], ['display', 'text', 1], ['private', 'text', 1], ['consent', 'check', 1]],
};
const FUND_STEPS: Record<number, Spec[]> = {
  1: [['ctype', 'ctype', 1], ['title', 'text', 1], ['cat', 'cats', 1], ['story', 'area', 1]],
  2: [['benName', 'text', 1], ['benAbout', 'text', 0], ['relation', 'relation', 1], ['orgName', 'text', 1], ['display', 'text', 1]],
  3: [['goal', 'num', 1], ['use', 'area', 1], ['deadline', 'date', 1], ['payLink', 'text', 0]],
  4: [['cover', 'image', 0], ['docs', 'files', 0]],
  5: [['private', 'text', 1], ['consent', 'check', 1], ['accurate', 'check', 1]],
};

export const FLOWS: Record<Flow, { steps: Record<number, Spec[]>; s: string; title: string; sub: string; desc: string; ref: string }> = {
  problem: { steps: PROBLEM_STEPS, s: 's', title: 'pc.problemT', sub: 'post.sub', desc: 'pc.problemD', ref: 'GN-DEMO-' },
  project: { steps: PROBLEM_STEPS, s: 's', title: 'pc.projectT', sub: 'post.subProject', desc: 'pc.projectD', ref: 'GN-PROJ-' },
  fund: { steps: FUND_STEPS, s: 'fs', title: 'pc.fundT', sub: 'post.subFund', desc: 'pc.fundD', ref: 'GN-FUND-' },
};

/** Choice fields: kind -> [value, text key]. `cats` is filled from the causes by the screen. */
export const CHOICES: Record<string, [string, string][]> = {
  urg: ['low', 'normal', 'high', 'emergency'].map((v) => [v, `urg.${v}`]),
  ongoing: ['yes', 'no', 'unsure'].map((v) => [v, `on.${v}`]),
  who: [['ind', 'who.ind'], ['org', 'who.org']],
  contact: ['phone', 'whatsapp', 'email', 'app'].map((v) => [v, `ct.${v}`]),
  ctype: [['individual', 'fund.individual'], ['org', 'fund.org']],
  relation: ['self', 'family', 'friend', 'other'].map((v) => [v, `rel.${v}`]),
};

export const PRIVATE = ['private', 'docs']; // reviewers only: never shown on public cards or previews
export const FILE_FIELDS = ['files', 'cover', 'docs'];

export const blankPost = (): PostData => ({
  title: '', cat: '', desc: '', help: '', city: '', area: '', affected: '', count: '', landmark: '', pin: false,
  started: '', urgency: 'normal', ongoing: '', actions: '', outcome: '', vols: '', skills: '', materials: '', budget: '', target: '', partners: '',
  who: '', orgName: '', contact: '', display: '', private: '', consent: false, files: [],
  payLink: '', ctype: '', story: '', benName: '', benAbout: '', relation: '', goal: '', use: '', deadline: '', cover: [], docs: [], accurate: false,
});
export const freshPost = (): PostState => ({ step: 1, max: 1, mode: 'form', data: blankPost(), errors: {}, fromReview: false, ref: '', restored: false });

export const specsOf = (flow: Flow, step: number) => FLOWS[flow].steps[step];
export const kindOf = (name: string) => [...Object.values(PROBLEM_STEPS), ...Object.values(FUND_STEPS)].flat().find(([n]) => n === name)?.[1] ?? 'text';

export function visible(flow: Flow, d: PostData, name: string) {
  if (name === 'orgName') return flow === 'fund' ? d.ctype === 'org' : d.who === 'org';
  if (name === 'relation') return d.ctype === 'individual';
  return true;
}

const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const isInt = (v: string, min: number) => /^\d+$/.test(v) && Number(v) >= min;
/** The date fields hint DD/MM/YYYY; accept that and the ISO form, and return ISO. */
export const isoDate = (v: string) => v.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (_, d, m, y) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Error code (an `e.<code>` text key) for one field, or '' when it is fine. Same rules as the prototype. */
export function fieldError(flow: Flow, d: PostData, name: string): string {
  if (!visible(flow, d, name)) return '';
  const raw = d[name];
  const v = typeof raw === 'string' ? raw.trim() : raw;
  const s = typeof v === 'string' ? v : '';
  switch (name) {
    case 'title': return s.length < 8 ? 'title' : '';
    case 'desc': return s.length < 30 ? 'desc' : '';
    case 'story': return s.length < 50 ? 'story' : '';
    case 'help': case 'outcome': case 'use': return s.length < 10 ? name : '';
    case 'city': case 'affected': case 'display': case 'benName': case 'orgName': return s.length < 2 ? name : '';
    case 'cat': case 'urgency': case 'who': case 'contact': case 'consent': case 'ctype': case 'relation': case 'accurate': return v ? '' : name;
    case 'count': return s && !isInt(s, 1) ? 'count' : '';
    case 'vols': case 'budget': return s && !isInt(s, 0) ? 'num' : '';
    case 'goal': return isInt(s, 1000) && Number(s) <= 5000000 ? '' : 'goal';
    case 'started': return s && (!isDate(isoDate(s)) || isoDate(s) > today()) ? 'started' : '';
    case 'target': return s && (!isDate(isoDate(s)) || isoDate(s) <= today()) ? 'target' : '';
    case 'payLink': return s && !/^(https?|upi):\/\/\S+$/i.test(s) ? 'payLink' : '';
    case 'deadline': return isDate(isoDate(s)) && isoDate(s) > today() ? '' : 'deadline';
    case 'private': return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) || /^(\+?91)?\d{10}$/.test(s.replace(/[\s-]/g, '')) ? '' : 'private';
    default: return '';
  }
}

export function validateStep(flow: Flow, d: PostData, step: number): Record<string, string> {
  const errs: Record<string, string> = {};
  specsOf(flow, step).forEach(([f]) => { const e = fieldError(flow, d, f); if (e) errs[f] = e; });
  return errs;
}
