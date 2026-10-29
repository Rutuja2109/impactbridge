// Cloud Functions that send the real push notifications straight through Firebase Cloud Messaging (FCM).
// No Expo service or Expo account is involved. Deploy from apps/mobile/firebase with:
//   firebase deploy --only functions      (needs the Blaze plan)
const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
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
