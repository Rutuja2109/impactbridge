// Monthly giving causes: the 4 or 5 cards the admin sets up (for example Health, Education, Food), each tied to one NGO with its UPI ID.
// Donors give to a cause every month; the money goes straight to that NGO's UPI ID and the admin confirms each payment.
//   sipCauses/{id}                 the card: cause, NGO, description, UPI ID, 80G number, suggested amounts, pictures, totals
//   sipCauses/{id}/donors/{uid}    one document for each person currently giving, so the card can show "N monthly donors"
import { addDoc, collection, deleteDoc, doc, getCountFromServer, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, where } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '../firebase';
import { useLive } from './communities';

export type Tier = { amount: number; text: string };
export type SipCause = {
  id: string; cat: string; title: string; ngo: string; about: string; upi: string; reg: string; site: string;
  img: string; logo: string; tiers: Tier[]; active: boolean; order: number; total: number; payments: number;
};

export const DEFAULT_TIERS: Tier[] = [{ amount: 100, text: '' }, { amount: 500, text: '' }, { amount: 1500, text: '' }];

const read = (id: string, x: Record<string, unknown>): SipCause => ({
  id, cat: String(x.cat ?? 'medical'), title: String(x.title ?? ''), ngo: String(x.ngo ?? ''), about: String(x.about ?? ''),
  upi: String(x.upi ?? ''), reg: String(x.reg ?? ''), site: String(x.site ?? ''), img: String(x.img ?? ''), logo: String(x.logo ?? ''),
  tiers: Array.isArray(x.tiers) && x.tiers.length ? (x.tiers as Tier[]).map((t) => ({ amount: Number(t.amount) || 0, text: String(t.text ?? '') })).filter((t) => t.amount >= 100) : DEFAULT_TIERS,
  active: x.active !== false, order: Number(x.order ?? 0), total: Number(x.total ?? 0), payments: Number(x.payments ?? 0),
});

/** All monthly causes, in the order the admin set. Donors see only active ones (see `useActiveSipCauses`). */
export const useSipCauses = () => useLive<SipCause[]>(db ? () => (cb) => onSnapshot(
  query(collection(db!, 'sipCauses'), orderBy('order', 'asc')),
  (s) => cb(s.docs.map((d) => read(d.id, d.data() ?? {}))),
  () => cb([]),
) : null, [], []);

export const useActiveSipCauses = () => useSipCauses().filter((c) => c.active && c.upi);

/** How many people are currently giving monthly to a cause. */
export function useCauseDonors(causeId: string | null, tick = 0) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!db || !causeId) return;
    getCountFromServer(collection(db, 'sipCauses', causeId, 'donors')).then((s) => setN(s.data().count)).catch(() => undefined);
  }, [causeId, tick]);
  return n;
}

/** Text of a suggested amount, or the generic line if the admin did not write one. */
export const tierLine = (t: Tier, fallback: string) => t.text.trim() || fallback;

export type CauseInput = Omit<SipCause, 'id' | 'total' | 'payments' | 'order'> & { order?: number };

export async function saveCause(id: string | null, c: CauseInput) {
  const data = { cat: c.cat, title: c.title.trim(), ngo: c.ngo.trim(), about: c.about.trim(), upi: c.upi.trim(), reg: c.reg.trim(), site: c.site.trim(), img: c.img, logo: c.logo, tiers: c.tiers, active: c.active };
  if (id) { await updateDoc(doc(db!, 'sipCauses', id), data); return id; }
  const ref = await addDoc(collection(db!, 'sipCauses'), { ...data, order: c.order ?? Date.now(), total: 0, payments: 0, createdAt: Date.now() });
  return ref.id;
}

export const removeCause = (id: string) => deleteDoc(doc(db!, 'sipCauses', id));

/** Marks that this person is now giving monthly to the cause (or has stopped). */
export const joinCause = (causeId: string, uid: string, name: string) => setDoc(doc(db!, 'sipCauses', causeId, 'donors', uid), { name, at: Date.now() });
export const leaveCause = (causeId: string, uid: string) => deleteDoc(doc(db!, 'sipCauses', causeId, 'donors', uid));

// ---- sample causes for testing: every title starts with "[Sample]" and carries sample: true so they can be removed in one tap
const SAMPLE: Omit<CauseInput, 'img' | 'logo'>[] = [
  { cat: 'medical', title: '[Sample] Health for every family', ngo: 'Sample Health Trust', about: 'Free check-ups, medicines and surgeries for families who cannot afford them.', upi: 'sample@okaxis', reg: '80G-SAMPLE-1', site: '', tiers: [{ amount: 100, text: 'Pays for a check-up' }, { amount: 500, text: 'Gives a family medicines for a month' }, { amount: 1500, text: 'Helps fund a small surgery' }], active: true },
  { cat: 'education', title: '[Sample] Books and bright futures', ngo: 'Sample Education Society', about: 'School fees, books and uniforms for children from low-income homes.', upi: 'sample@okicici', reg: '80G-SAMPLE-2', site: '', tiers: [{ amount: 100, text: 'Books for one child' }, { amount: 500, text: 'School fees for a month' }, { amount: 1500, text: 'Sponsors a child for a term' }], active: true },
  { cat: 'food', title: '[Sample] No one sleeps hungry', ngo: 'Sample Seva Kitchen', about: 'A hot evening meal for people who cannot afford one, cooked by volunteers.', upi: 'sample@oksbi', reg: '', site: '', tiers: [{ amount: 100, text: 'Feeds 3 people' }, { amount: 500, text: 'Feeds a family for a month' }, { amount: 1500, text: 'Feeds 10 people every week' }], active: true },
  { cat: 'animals', title: '[Sample] Care for street animals', ngo: 'Sample Animal Rescue', about: 'Treatment, shelter and vaccinations for injured and abandoned animals.', upi: 'sample@okhdfc', reg: '', site: '', tiers: [{ amount: 100, text: 'One vaccination' }, { amount: 500, text: 'Treats an injured animal' }, { amount: 1500, text: 'A month of shelter and food' }], active: true },
  { cat: 'environment', title: '[Sample] Green neighbourhoods', ngo: 'Sample Green Foundation', about: 'Planting and protecting trees in your city with local volunteers.', upi: 'sample@okaxis', reg: '', site: '', tiers: [{ amount: 100, text: 'Plants 2 saplings' }, { amount: 500, text: 'Plants and guards 10 trees' }, { amount: 1500, text: 'Greens a whole lane' }], active: true },
];

export async function loadSampleCauses(): Promise<number> {
  let n = 0;
  for (const c of SAMPLE) {
    await addDoc(collection(db!, 'sipCauses'), { ...c, img: '', logo: '', order: Date.now() + n, total: 0, payments: 0, sample: true, createdAt: Date.now() });
    n += 1;
  }
  return n;
}

export async function removeSampleCauses(): Promise<number> {
  const rows = await getDocs(query(collection(db!, 'sipCauses'), where('sample', '==', true)));
  for (const r of rows.docs) {
    const donors = await getDocs(collection(db!, 'sipCauses', r.id, 'donors'));
    await Promise.all(donors.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(r.ref);
  }
  return rows.size;
}
