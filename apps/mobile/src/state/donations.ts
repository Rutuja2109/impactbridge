// UPI donations. GoodNeighbour never touches the money: the donor pays the organiser's UPI ID in their own UPI app, then records
// the payment here as "pledged". The organiser (or an admin) marks it "received" after seeing it in their bank; only then do
// the campaign's received total and supporter list change, and the donor sees "organiser confirmed" in their own giving list.
import { collection, doc, increment, onSnapshot, writeBatch } from '@react-native-firebase/firestore';

import { db } from '../firebase';
import type { User } from '../screens/Welcome';
import { useLive } from './communities';

export type DonationStatus = 'pledged' | 'received' | 'not_received';
export type Donation = { id: string; uid: string; name: string; amount: number; ref: string; status: DonationStatus; at: number };
/** The donor's own copy of a payment, so they can follow it from their Impact page. */
export type Give = { id: string; postId: string; title: string; amount: number; status: DonationStatus; at: number; confirmedAt?: number };
export type Supporter = { id: string; name: string; amount: number; at: number };

export const UPI_ID = /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9]{1,}$/;

/** The link that opens the donor's UPI app with the payee and amount filled in. */
export function upiUrl(payTo: string, title: string, amount: number): string | null {
  if (UPI_ID.test(payTo)) return `upi://pay?pa=${encodeURIComponent(payTo)}&pn=${encodeURIComponent(title.slice(0, 40))}&am=${amount}&cu=INR&tn=GoodNeighbour`;
  if (/^(https?|upi):\/\//i.test(payTo)) return payTo;
  return null;
}

export async function recordDonation(u: User, postId: string, title: string, amount: number, ref: string) {
  const at = Date.now();
  const entry = doc(collection(db!, 'posts', postId, 'donations'));
  const b = writeBatch(db!);
  b.set(entry, { uid: u.uid, name: u.name, amount, ref, status: 'pledged', at });
  b.set(doc(db!, 'users', u.uid!, 'gives', entry.id), { postId, title, amount, status: 'pledged', at });
  b.set(doc(db!, 'users', u.uid!), { gave: true }, { merge: true });
  await b.commit();
}

/** Donations to one post: the organiser and admins see all of them, a donor only their own (rules decide). */
export const useDonations = (postId: string | null) => useLive<Donation[]>(db && postId ? () => (cb) => onSnapshot(
  collection(db!, 'posts', postId, 'donations'),
  (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Donation, 'id'>) })).sort((a, b) => b.at - a.at)),
  () => cb([]),
) : null, [], [postId]);

/** The signed-in person's own payments with their status, newest first. */
export const useMyGives = (uid?: string) => useLive<Give[]>(db && uid ? () => (cb) => onSnapshot(
  collection(db!, 'users', uid, 'gives'),
  (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Give, 'id'>) })).sort((a, b) => b.at - a.at)),
  () => cb([]),
) : null, [], [uid]);

/** Payments the organiser has confirmed receiving, shown to everyone on the fundraiser page. */
export const useSupporters = (postId: string | null) => useLive<Supporter[]>(db && postId ? () => (cb) => onSnapshot(
  collection(db!, 'posts', postId, 'supporters'),
  (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Supporter, 'id'>) })).sort((a, b) => b.at - a.at)),
  () => cb([]),
) : null, [], [postId]);

/** The organiser (or an admin) confirms or rejects one payment. Confirming raises the public totals, adds the supporter to the
 *  fundraiser page and shows "confirmed" to the donor. */
export async function settleDonation(postId: string, d: Donation, received: boolean) {
  const now = Date.now();
  const b = writeBatch(db!);
  b.update(doc(db!, 'posts', postId, 'donations', d.id), { status: received ? 'received' : 'not_received' });
  b.update(doc(db!, 'users', d.uid, 'gives', d.id), { status: received ? 'received' : 'not_received', confirmedAt: now });
  if (received) {
    b.update(doc(db!, 'posts', postId), { received: increment(d.amount), donors: increment(1) });
    b.set(doc(db!, 'posts', postId, 'supporters', d.id), { name: d.name, amount: d.amount, at: now });
  }
  await b.commit();
}
