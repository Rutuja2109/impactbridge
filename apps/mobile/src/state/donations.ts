// UPI donations. GoodNeighbour never touches the money: the donor pays the organiser's UPI ID in their own UPI app, then records
// the payment here as "pledged". The organiser (or an admin) marks it "received" after seeing it in their bank; only then do
// the campaign's received total and supporter count go up.
import { addDoc, collection, doc, increment, onSnapshot, writeBatch } from '@react-native-firebase/firestore';

import { db } from '../firebase';
import type { User } from '../screens/Welcome';
import { useLive } from './communities';

export type Donation = { id: string; uid: string; name: string; amount: number; ref: string; status: 'pledged' | 'received' | 'not_received'; at: number };

export const UPI_ID = /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9]{1,}$/;

/** The link that opens the donor's UPI app with the payee and amount filled in. */
export function upiUrl(payTo: string, title: string, amount: number): string | null {
  if (UPI_ID.test(payTo)) return `upi://pay?pa=${encodeURIComponent(payTo)}&pn=${encodeURIComponent(title.slice(0, 40))}&am=${amount}&cu=INR&tn=GoodNeighbour`;
  if (/^(https?|upi):\/\//i.test(payTo)) return payTo;
  return null;
}

export const recordDonation = (u: User, postId: string, amount: number, ref: string) =>
  addDoc(collection(db!, 'posts', postId, 'donations'), { uid: u.uid, name: u.name, amount, ref, status: 'pledged', at: Date.now() });

/** Donations to one post: the organiser and admins see all of them, a donor only their own (rules decide). */
export const useDonations = (postId: string | null) => useLive<Donation[]>(db && postId ? () => (cb) => onSnapshot(
  collection(db!, 'posts', postId, 'donations'),
  (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Donation, 'id'>) })).sort((a, b) => b.at - a.at)),
  () => cb([]),
) : null, [], [postId]);

/** The organiser (or an admin) confirms or rejects one payment; confirming raises the campaign's public totals. */
export async function settleDonation(postId: string, d: Donation, received: boolean) {
  const b = writeBatch(db!);
  b.update(doc(db!, 'posts', postId, 'donations', d.id), { status: received ? 'received' : 'not_received' });
  if (received) b.update(doc(db!, 'posts', postId), { received: increment(d.amount), donors: increment(1) });
  await b.commit();
}
