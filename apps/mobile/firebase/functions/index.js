// Cloud Functions that send the real push notifications straight through Firebase Cloud Messaging (FCM).
// No Expo service or Expo account is involved. Deploy from apps/mobile/firebase with:
//   firebase deploy --only functions      (needs the Blaze plan)
const { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

async function push(tokens, title, body, data) {
  for (let i = 0; i < tokens.length; i += 500) {
    await getMessaging().sendEachForMulticast({
      tokens: tokens.slice(i, i + 500),
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high', notification: { channelId: 'default' } },
    });
  }
}

async function tokensFor(uids) {
  const snaps = await Promise.all(uids.map((u) => db.doc(`users/${u}`).get()));
  return snaps.map((s) => s.data()?.pushToken).filter(Boolean);
}

// Someone joined a community: tell the organisation that posted it, and keep a copy in their in-app list.
exports.onMemberJoined = onDocumentCreated('communities/{cid}/members/{uid}', async (event) => {
  const { cid } = event.params;
  const member = event.data.data();
  const community = (await db.doc(`communities/${cid}`).get()).data();
  if (!community) return;
  await db.doc(`communities/${cid}`).update({ memberCount: FieldValue.increment(1) });
  const title = 'New member joined';
  const body = `${member.name || 'A neighbour'} joined ${community.name}`;
  await db.collection(`users/${community.ownerId}/notifications`).add({ title, body, cid, read: false, at: Date.now() });
  await push(await tokensFor([community.ownerId]), title, body, { cid });
});

// A verified organisation added a community: tell everyone who has notifications on.
exports.onCommunityCreated = onDocumentCreated('communities/{cid}', async (event) => {
  const community = event.data.data();
  const users = await db.collection('users').where('pushToken', '!=', null).get();
  const title = 'New community';
  const body = `${community.orgName || 'An organisation'} started ${community.name}. Tap to join.`;
  const tokens = users.docs.filter((d) => d.id !== community.ownerId).map((d) => d.data().pushToken);
  await push(tokens, title, body, { cid: event.params.cid });
});

exports.onMemberLeft = onDocumentDeleted('communities/{cid}/members/{uid}', async (event) => {
  await db.doc(`communities/${event.params.cid}`).update({ memberCount: FieldValue.increment(-1) }).catch(() => {});
});

// Someone offered help on a post: tell the person who posted it.
exports.onHelpOffered = onDocumentCreated('posts/{pid}/responses/{uid}', async (event) => {
  const r = event.data.data();
  const post = (await db.doc(`posts/${event.params.pid}`).get()).data();
  if (!post) return;
  const title = r.kind === 'volunteer' ? 'A neighbour can volunteer' : 'A neighbour can give items';
  const body = `${r.name || 'Someone'} (${r.email}) offered help on "${post.data?.title || 'your post'}"`;
  await db.collection(`users/${post.ownerId}/notifications`).add({ title, body, pid: event.params.pid, read: false, at: Date.now() });
  await push(await tokensFor([post.ownerId]), title, body, { pid: event.params.pid });
});

// A post was approved: tell the author, and tell everyone else who has notifications on that there is something new to see.
exports.onPostApproved = onDocumentUpdated('posts/{pid}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === 'approved' || after.status !== 'approved') return;
  const title = 'Your post is live';
  const body = `"${after.data?.title || 'Your post'}" was approved and neighbours can now see it.`;
  await db.collection(`users/${after.ownerId}/notifications`).add({ title, body, pid: event.params.pid, read: false, at: Date.now() });
  await push(await tokensFor([after.ownerId]), title, body, { pid: event.params.pid });

  const users = await db.collection('users').where('pushToken', '!=', null).get();
  const everyone = users.docs.filter((d) => d.id !== after.ownerId).map((d) => d.data().pushToken);
  const kind = after.flow === 'fund' ? 'fundraiser' : after.flow === 'project' ? 'community project' : 'need';
  await push(everyone, `New ${kind} in ${after.data?.city || 'your area'}`, `${after.data?.title || 'A neighbour needs help'}. Tap to see how you can help.`, { pid: event.params.pid });
});

// The organiser confirmed (or rejected) a payment: tell the donor.
exports.onGiveSettled = onDocumentUpdated('users/{uid}/gives/{gid}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status || after.status === 'pledged') return;
  const received = after.status === 'received';
  const title = received ? 'Payment received' : 'Payment not received';
  const body = received
    ? `The organiser confirmed receiving your Rs ${after.amount} for "${after.title}". Thank you!`
    : `The organiser says your Rs ${after.amount} for "${after.title}" was not received.`;
  await db.collection(`users/${event.params.uid}/notifications`).add({ title, body, pid: after.postId, read: false, at: Date.now() });
  await push(await tokensFor([event.params.uid]), title, body, { pid: after.postId });
});

// Monthly giving (SIP) with Razorpay: see sip.js for the one-time setup.
Object.assign(exports, require('./sip'));
