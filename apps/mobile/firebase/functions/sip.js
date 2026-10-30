// Monthly giving (SIP) through Razorpay Subscriptions + UPI AutoPay, the same pattern Ketto uses. Razorpay's secret keys live ONLY here
// as Firebase secrets; the phone never sees them. Money is charged by Razorpay to the merchant account the admin set up in the
// Razorpay dashboard; GoodNeighbour then passes it on to the organiser and records that in the app (payouts).
//
// One-time setup (needs the Blaze plan), from apps/mobile/firebase:
//   firebase functions:secrets:set RAZORPAY_KEY_ID          (the key id, starts rzp_test_ in test mode)
//   firebase functions:secrets:set RAZORPAY_KEY_SECRET
//   firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET  (any long random text; use the same in the Razorpay webhook)
//   firebase deploy --only functions
// Razorpay dashboard > Webhooks: URL https://asia-south1-<project>.cloudfunctions.net/razorpayWebhook, events subscription.* .
const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

if (!getApps().length) initializeApp();
const db = getFirestore();

const KEY_ID = defineSecret('RAZORPAY_KEY_ID');
const KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');
const WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET');
const REGION = 'asia-south1';
const MIN = 100;
const MAX = 15000; // above this a UPI AutoPay debit needs extra approval each month

async function razorpay(path, body) {
  const auth = Buffer.from(`${KEY_ID.value()}:${KEY_SECRET.value()}`).toString('base64');
  const r = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error?.description || 'Razorpay error'); e.status = r.status; throw e; }
  return j;
}

/** The signed-in person from the Authorization header (a Firebase ID token), or null. Unverified e-mail/password accounts are refused. */
async function whoIs(req) {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!m) return null;
  try {
    const t = await getAuth().verifyIdToken(m[1]);
    if (t.firebase?.sign_in_provider === 'password' && !t.email_verified) return null;
    return t;
  } catch { return null; }
}

const isAdmin = async (uid) => (await db.doc(`admins/${uid}`).get()).exists;

async function push(tokens, title, body, data) {
  if (!tokens.length) return;
  await getMessaging().sendEachForMulticast({
    tokens, notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    android: { priority: 'high', notification: { channelId: 'default' } },
  }).catch(() => {});
}

// POST { postId, amount }: creates the Razorpay subscription for one fundraiser and returns what the phone's checkout needs.
exports.createSip = onRequest({ region: REGION, secrets: [KEY_ID, KEY_SECRET], cors: true }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const me = await whoIs(req);
  if (!me) return res.status(401).json({ error: 'Please sign in again.' });
  const amount = Number(req.body?.amount);
  const postId = String(req.body?.postId || '');
  if (!Number.isInteger(amount) || amount < MIN || amount > MAX) return res.status(400).json({ error: `Choose an amount from Rs ${MIN} to Rs ${MAX}.` });
  const cfg = (await db.doc('config/sip').get()).data();
  if (!cfg || cfg.enabled !== true) return res.status(403).json({ error: 'Monthly giving is not switched on yet.' });
  const post = (await db.doc(`posts/${postId}`).get()).data();
  if (!post || post.status !== 'approved' || post.flow !== 'fund') return res.status(404).json({ error: 'This fundraiser is not open.' });
  try {
    // One plan per amount, created the first time that amount is used.
    const planRef = db.doc(`sipPlans/${amount}`);
    let planId = (await planRef.get()).data()?.id;
    if (!planId) {
      const plan = await razorpay('/plans', { period: 'monthly', interval: 1, item: { name: `GoodNeighbour monthly gift Rs ${amount}`, amount: amount * 100, currency: 'INR' } });
      planId = plan.id;
      await planRef.set({ id: planId, amount });
    }
    const sub = await razorpay('/subscriptions', {
      plan_id: planId, total_count: 120, quantity: 1, customer_notify: 1,
      notes: { uid: me.uid, postId, app: 'goodneighbour' },
    });
    await db.doc(`sips/${sub.id}`).set({
      uid: me.uid, name: me.name || '', email: me.email || '', postId, title: post.data?.title || '', amount,
      status: 'created', paidCount: 0, totalPaid: 0, createdAt: Date.now(),
    });
    return res.json({ subscriptionId: sub.id, keyId: KEY_ID.value() });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Could not start monthly giving.' });
  }
});

// POST { sipId }: stops a monthly gift. Only its donor or an admin can do this.
exports.cancelSip = onRequest({ region: REGION, secrets: [KEY_ID, KEY_SECRET], cors: true }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const me = await whoIs(req);
  if (!me) return res.status(401).json({ error: 'Please sign in again.' });
  const sipId = String(req.body?.sipId || '');
  const ref = db.doc(`sips/${sipId}`);
  const sip = (await ref.get()).data();
  if (!sip) return res.status(404).json({ error: 'Monthly gift not found.' });
  if (sip.uid !== me.uid && !(await isAdmin(me.uid))) return res.status(403).json({ error: 'Not allowed.' });
  try {
    await razorpay(`/subscriptions/${sipId}/cancel`, { cancel_at_cycle_end: 0 });
  } catch (e) {
    if (!/cancel|already/i.test(e.message || '')) return res.status(502).json({ error: e.message || 'Could not cancel.' });
  }
  await ref.update({ status: 'cancelled', cancelledAt: Date.now() });
  return res.json({ ok: true });
});

const STATUS = {
  'subscription.authenticated': 'authenticated', 'subscription.activated': 'active', 'subscription.pending': 'pending',
  'subscription.halted': 'halted', 'subscription.cancelled': 'cancelled', 'subscription.completed': 'completed',
  'subscription.paused': 'paused', 'subscription.resumed': 'active',
};

// Razorpay calls this after every change. The signature proves the call is really from Razorpay.
exports.razorpayWebhook = onRequest({ region: REGION, secrets: [WEBHOOK_SECRET] }, async (req, res) => {
  const sig = req.get('x-razorpay-signature') || '';
  const want = crypto.createHmac('sha256', WEBHOOK_SECRET.value()).update(req.rawBody).digest('hex');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return res.status(400).send('bad signature');

  const ev = req.body?.event;
  const sub = req.body?.payload?.subscription?.entity;
  if (!sub?.id) return res.send('ignored');
  const sipRef = db.doc(`sips/${sub.id}`);
  const sip = (await sipRef.get()).data();
  if (!sip) return res.send('unknown subscription');

  const base = { updatedAt: Date.now(), paidCountRz: sub.paid_count ?? 0, ...(sub.charge_at ? { nextChargeAt: sub.charge_at * 1000 } : {}) };
  if (STATUS[ev]) await sipRef.update({ ...base, status: STATUS[ev] });

  if (ev === 'subscription.charged') {
    const pay = req.body?.payload?.payment?.entity;
    if (pay?.id) {
      const chargeRef = sipRef.collection('charges').doc(pay.id);
      const rupees = Math.round((pay.amount || sip.amount * 100) / 100);
      const first = await db.runTransaction(async (tx) => {
        if ((await tx.get(chargeRef)).exists) return false; // Razorpay can send the same event twice
        tx.set(chargeRef, { amount: rupees, at: Date.now(), method: pay.method || '' });
        tx.update(sipRef, { ...base, status: 'active', paidCount: FieldValue.increment(1), totalPaid: FieldValue.increment(rupees), lastChargedAt: Date.now() });
        tx.update(db.doc(`posts/${sip.postId}`), { sipTotal: FieldValue.increment(rupees), sipCharges: FieldValue.increment(1) });
        // The donor's own list shows it as given, like a payment the organiser confirmed.
        tx.set(db.doc(`users/${sip.uid}/gives/${pay.id}`), { postId: sip.postId, title: sip.title, amount: rupees, status: 'received', via: 'sip', at: Date.now(), confirmedAt: Date.now() });
        tx.set(db.doc(`users/${sip.uid}`), { gave: true }, { merge: true });
        return true;
      });
      if (first) {
        const title = 'Monthly gift received';
        const body = `Your Rs ${rupees} for "${sip.title}" was charged. Thank you!`;
        await db.collection(`users/${sip.uid}/notifications`).add({ title, body, pid: sip.postId, read: false, at: Date.now() });
        const tok = (await db.doc(`users/${sip.uid}`).get()).data()?.pushToken;
        await push(tok ? [tok] : [], title, body, { pid: sip.postId });
      }
    }
  }
  return res.send('ok');
});
