// Monthly giving (SIP), the app's side. The server (Cloud Functions + Razorpay) creates and changes every monthly gift; the phone
// asks it to start or stop one, shows Razorpay's checkout so the donor approves the UPI AutoPay mandate once, and then only reads.
import { collection, doc, onSnapshot, query, setDoc, where } from '@react-native-firebase/firestore';

import { auth, db } from '../firebase';
import { useLive } from './communities';

export type SipStatus = 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'paused' | 'cancelled' | 'completed';
export type Sip = { id: string; postId: string; title: string; amount: number; status: SipStatus; paidCount: number; totalPaid: number; nextChargeAt?: number; createdAt: number };
export type SipConfig = { enabled: boolean; payeeName: string; payeeHint: string };

export const SIP_MIN = 100;
export const SIP_MAX = 15000;

const BASE = process.env.EXPO_PUBLIC_FUNCTIONS_URL ?? 'https://asia-south1-goodneighbour-7a870.cloudfunctions.net';

async function call(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = await auth?.currentUser?.getIdToken();
  const r = await fetch(`${BASE}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(j.error ?? 'Something went wrong. Try again.'));
  return j;
}

export const startSip = (postId: string, amount: number) => call('createSip', { postId, amount }) as Promise<{ subscriptionId: string; keyId: string }>;
export const cancelSip = (sipId: string) => call('cancelSip', { sipId });

/** The person's own monthly gifts, newest first. */
export const useMySips = (uid?: string) => useLive<Sip[]>(db && uid ? () => (cb) => onSnapshot(
  query(collection(db!, 'sips'), where('uid', '==', uid)),
  (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Sip, 'id'>) })).sort((a, b) => b.createdAt - a.createdAt)),
  () => cb([]),
) : null, [], [uid]);

/** Whether monthly giving is on, and who receives the money (set by the admin). Off until the admin switches it on. */
export const useSipConfig = () => useLive<SipConfig>(db ? () => (cb) => onSnapshot(
  doc(db!, 'config', 'sip'),
  (s) => { const x = s.data(); cb({ enabled: x?.enabled === true, payeeName: String(x?.payeeName ?? ''), payeeHint: String(x?.payeeHint ?? '') }); },
  () => cb({ enabled: false, payeeName: '', payeeHint: '' }),
) : null, { enabled: false, payeeName: '', payeeHint: '' }, []);

/** Admin: save who receives monthly giving. The full number/UPI ID goes in an admin-only document; donors see the name and last digits. */
export async function saveSipConfig(c: { enabled: boolean; payeeName: string; payee: string; note: string }) {
  const digits = c.payee.replace(/\D/g, '');
  const hint = digits.length >= 4 ? `••••${digits.slice(-4)}` : c.payee.includes('@') ? `${c.payee.slice(0, 2)}••@${c.payee.split('@')[1]}` : '';
  await setDoc(doc(db!, 'config', 'sip'), { enabled: c.enabled, payeeName: c.payeeName.trim(), payeeHint: hint, updatedAt: Date.now() });
  await setDoc(doc(db!, 'config', 'sipPrivate'), { payee: c.payee.trim(), note: c.note.trim(), updatedAt: Date.now() });
}
