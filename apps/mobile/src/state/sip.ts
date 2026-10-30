// Monthly giving (SIP). Two modes, chosen by the admin (Admin > Monthly giving):
//  "reminder" (free, the default): the donor picks an amount and a day. Each month the phone reminds them and opens their UPI app
//     (PhonePe, GPay ...) to pay the UPI ID the admin set. The donor taps "I have paid" and the admin confirms it.
//  "autopay": Razorpay UPI AutoPay (see firebase/functions/sip.js). The donor approves a mandate once in their UPI app and the money
//     is then charged automatically. This needs a Razorpay account, a server (Blaze) and, for live use, a registered business.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, collection, doc, increment, onSnapshot, query, setDoc, updateDoc, where, writeBatch } from '@react-native-firebase/firestore';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { auth, db } from '../firebase';
import type { User } from '../screens/Welcome';
import { useLive } from './communities';

export type SipStatus = 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'paused' | 'cancelled' | 'completed';
export type Sip = { id: string; postId: string; title: string; amount: number; status: SipStatus; mode?: 'reminder' | 'autopay'; day?: number; paidCount: number; totalPaid: number; nextChargeAt?: number; createdAt: number };
export type SipMode = 'reminder' | 'autopay';
export type SipConfig = { enabled: boolean; mode: SipMode; payeeName: string; payeeUpi: string; payeeHint: string };
export type SipPayment = { id: string; sipId: string; uid: string; name: string; postId: string; title: string; amount: number; status: 'pledged' | 'received' | 'not_received'; at: number };

export const SIP_MIN = 100;
export const SIP_MAX = 15000;
export const NO_SIP: SipConfig = { enabled: false, mode: 'reminder', payeeName: '', payeeUpi: '', payeeHint: '' };

const BASE = process.env.EXPO_PUBLIC_FUNCTIONS_URL ?? 'https://asia-south1-goodneighbour-7a870.cloudfunctions.net';

async function call(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = await auth?.currentUser?.getIdToken();
  const r = await fetch(`${BASE}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(j.error ?? 'Something went wrong. Try again.'));
  return j;
}

/** Autopay mode: asks the server to create the Razorpay subscription. */
export const startAutopay = (postId: string, amount: number) => call('createSip', { postId, amount }) as Promise<{ subscriptionId: string; keyId: string }>;

/** The person's own monthly gifts, newest first. */
export const useMySips = (uid?: string) => useLive<Sip[]>(db && uid ? () => (cb) => onSnapshot(
  query(collection(db!, 'sips'), where('uid', '==', uid)),
  (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Sip, 'id'>) })).sort((a, b) => b.createdAt - a.createdAt)),
  () => cb([]),
) : null, [], [uid]);

/** Whether monthly giving is on, in which mode, and who receives the money (all set by the admin). Off until the admin switches it on. */
export const useSipConfig = () => useLive<SipConfig>(db ? () => (cb) => onSnapshot(
  doc(db!, 'config', 'sip'),
  (s) => { const x = s.data(); cb({ enabled: x?.enabled === true, mode: x?.mode === 'autopay' ? 'autopay' : 'reminder', payeeName: String(x?.payeeName ?? ''), payeeUpi: String(x?.payeeUpi ?? ''), payeeHint: String(x?.payeeHint ?? '') }); },
  () => cb(NO_SIP),
) : null, NO_SIP, []);

/** Admin: save how monthly giving works and who receives the money. Donors see the name and the last characters of the UPI ID. */
export async function saveSipConfig(c: { enabled: boolean; mode: SipMode; payeeName: string; payeeUpi: string; note: string }) {
  const u = c.payeeUpi.trim();
  const at = u.indexOf('@');
  const hint = at > 1 ? `${u.slice(0, 2)}••${u.slice(at)}` : '';
  await setDoc(doc(db!, 'config', 'sip'), { enabled: c.enabled, mode: c.mode, payeeName: c.payeeName.trim(), payeeUpi: u, payeeHint: hint, updatedAt: Date.now() });
  await setDoc(doc(db!, 'config', 'sipPrivate'), { note: c.note.trim(), updatedAt: Date.now() });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Reminder mode

const KEY = 'gn-sip-reminders'; // { [sipId]: notificationId }, so a reminder can be cancelled later
const read = async (): Promise<Record<string, string>> => { try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}'); } catch { return {}; } };

/** Schedules the monthly reminder on this phone (10:00 on the chosen day). Returns false if notifications are not allowed. */
export async function scheduleReminder(sip: { id: string; postId: string; title: string; amount: number; day: number }, texts: { title: string; body: string }): Promise<boolean> {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return false;
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'GoodNeighbour', importance: Notifications.AndroidImportance.HIGH });
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: texts.title, body: texts.body, data: { sipId: sip.id, sipPost: sip.postId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.MONTHLY, day: Math.min(28, Math.max(1, sip.day)), hour: 10, minute: 0, channelId: 'default' },
    });
    const map = await read();
    map[sip.id] = id;
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
    return true;
  } catch { return false; }
}

async function dropReminder(sipId: string) {
  try {
    const map = await read();
    if (map[sipId]) await Notifications.cancelScheduledNotificationAsync(map[sipId]);
    delete map[sipId];
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch { /* nothing to cancel */ }
}

/** Reminder mode: saves the monthly plan. Returns its id. */
export async function startReminder(u: User, postId: string, title: string, amount: number, day: number): Promise<string> {
  const ref = await addDoc(collection(db!, 'sips'), {
    uid: u.uid, name: u.name, email: u.email, postId, title, amount, mode: 'reminder', day, status: 'active', paidCount: 0, totalPaid: 0, createdAt: Date.now(),
  });
  return ref.id;
}

/** The donor says they paid this month's gift in their UPI app; the admin confirms it. */
export async function recordMonthlyPayment(u: User, sip: { id: string; postId: string; title: string; amount: number }) {
  const at = Date.now();
  const pay = doc(collection(db!, 'sipPayments'));
  const b = writeBatch(db!);
  b.set(pay, { sipId: sip.id, uid: u.uid, name: u.name, postId: sip.postId, title: sip.title, amount: sip.amount, status: 'pledged', at });
  b.set(doc(db!, 'users', u.uid!, 'gives', pay.id), { postId: sip.postId, title: sip.title, amount: sip.amount, status: 'pledged', via: 'sip', at });
  b.set(doc(db!, 'users', u.uid!), { gave: true }, { merge: true });
  await b.commit();
}

/** Stops a monthly gift in either mode. */
export async function stopSip(sip: Sip) {
  if (sip.mode === 'reminder') {
    await updateDoc(doc(db!, 'sips', sip.id), { status: 'cancelled', cancelledAt: Date.now() });
    await dropReminder(sip.id);
    return;
  }
  await call('cancelSip', { sipId: sip.id });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Admin: monthly payments waiting to be confirmed

export const usePendingSipPayments = () => useLive<SipPayment[]>(db ? () => (cb) => onSnapshot(
  query(collection(db!, 'sipPayments'), where('status', '==', 'pledged')),
  (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SipPayment, 'id'>) })).sort((a, b) => a.at - b.at)),
  () => cb([]),
) : null, [], []);

/** Admin confirms (or rejects) one monthly payment after seeing it arrive. Confirming adds it to the gift's totals. */
export async function settleSipPayment(p: SipPayment, received: boolean) {
  const now = Date.now();
  const b = writeBatch(db!);
  b.update(doc(db!, 'sipPayments', p.id), { status: received ? 'received' : 'not_received', confirmedAt: now });
  b.update(doc(db!, 'users', p.uid, 'gives', p.id), { status: received ? 'received' : 'not_received', confirmedAt: now });
  if (received) {
    b.update(doc(db!, 'sips', p.sipId), { paidCount: increment(1), totalPaid: increment(p.amount), lastChargedAt: now });
    b.update(doc(db!, 'posts', p.postId), { sipTotal: increment(p.amount), sipCharges: increment(1) });
  }
  await b.commit();
}
