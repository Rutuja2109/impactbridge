// Admin tools, shown in the profile drawer to people who have a document in /admins/{uid}. English only (staff screen).
// Review new posts and organisations, see who offered help on each live post, and read reports. Firestore rules do the
// real checking; this screen only shows buttons.
import { collection, doc, getDoc, onSnapshot, orderBy, query, updateDoc, where } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { db } from '../firebase';
import { useLive } from '../state/communities';
import { usePostPhotos } from '../state/files';
import { colors, radius, space } from '../theme';
import DonationsList from './DonationsList';
import { Button } from './ui';

type PostRow = { id: string; flow: string; status: string; ownerName: string; at: number; data: Record<string, string> };
type OrgRow = { id: string; orgName: string; kind: string; regNo: string; contact: string; ownerEmail: string };
type ReportRow = { id: string; targetType: string; targetId: string; reason: string; at: number };
type Response = { uid: string; name: string; email: string; kind: string };

const postsBy = (status: string) => useLive<PostRow[]>(db ? () => (cb) => onSnapshot(
  query(collection(db!, 'posts'), where('status', '==', status)),
  (s) => cb(s.docs.map((d) => { const x = d.data(); return { id: d.id, flow: x.flow, status: x.status, ownerName: x.ownerName, at: Number(x.createdAt ?? 0), data: x.data ?? {} } as PostRow; }).sort((a, b) => b.at - a.at)),
  () => {},
) : null, [], [status]);

const setStatus = (id: string, status: string) => updateDoc(doc(db!, 'posts', id), { status, reviewedAt: Date.now() });

function PostCard({ p, review }: { p: PostRow; review: boolean }) {
  const [contact, setContact] = useState('');
  const [resp, setResp] = useState<Response[]>([]);
  const [busy, setBusy] = useState(false);
  const photos = usePostPhotos(review ? p.id : null);
  useEffect(() => {
    if (review) getDoc(doc(db!, 'posts', p.id, 'private', 'info')).then((s) => { const x = s.data(); setContact(x ? [x.private, x.ownerEmail].filter(Boolean).join(' · ') : ''); }).catch(() => {});
    else return onSnapshot(collection(db!, 'posts', p.id, 'responses'), (s) => setResp(s.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Response, 'uid'>) }))), () => {});
    return undefined;
  }, [p.id, review]);
  const act = (status: string) => { setBusy(true); setStatus(p.id, status).catch(() => {}).finally(() => setBusy(false)); };
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{p.data.title || '(no title)'}</Text>
      <Text style={styles.meta}>{p.flow} · {p.data.city || '—'} · by {p.ownerName || 'unknown'} · {new Date(p.at).toLocaleDateString()}</Text>
      <Text style={styles.body} numberOfLines={review ? 8 : 2}>{(p.data.desc || p.data.story || '').trim()}</Text>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {photos.map((ph) => <Image key={ph.id} source={{ uri: `data:image/jpeg;base64,${ph.b64}` }} style={styles.thumb} />)}
        </ScrollView>
      ) : null}
      {review ? (
        <>
          {contact ? <Text style={styles.meta}>Private contact: {contact}</Text> : null}
          <View style={styles.row}>
            <View style={styles.flex}><Button label="Approve" small block disabled={busy} onPress={() => act('approved')} /></View>
            <View style={styles.flex}><Button label="Reject" small block variant="ghost" disabled={busy} onPress={() => act('rejected')} /></View>
          </View>
        </>
      ) : (
        <>
          {p.flow === 'fund' ? <DonationsList postId={p.id} /> : null}
          <Text style={styles.meta}>{resp.length} offer{resp.length === 1 ? '' : 's'} of help</Text>
          {resp.map((r) => <Text key={r.uid} style={styles.meta}>• {r.name} ({r.kind}) {r.email}</Text>)}
          <Button label="Take down" small variant="ghost" disabled={busy} onPress={() => act('rejected')} />
        </>
      )}
    </View>
  );
}

function Orgs() {
  const rows = useLive<OrgRow[]>(db ? () => (cb) => onSnapshot(
    query(collection(db!, 'orgs'), where('status', '==', 'pending')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrgRow, 'id'>) }))),
    () => {},
  ) : null, [], []);
  const set = (id: string, ok: boolean) => updateDoc(doc(db!, 'orgs', id), ok ? { verified: true, status: 'verified' } : { verified: false, status: 'rejected' }).catch(() => {});
  return (
    <>
      <Text style={styles.h}>Organisations to verify ({rows.length})</Text>
      {rows.length ? null : <Text style={styles.meta}>None waiting.</Text>}
      {rows.map((o) => (
        <View key={o.id} style={styles.card}>
          <Text style={styles.title}>{o.orgName}</Text>
          <Text style={styles.meta}>{o.kind} · reg {o.regNo || '—'}</Text>
          <Text style={styles.meta}>{o.contact} · {o.ownerEmail}</Text>
          <View style={styles.row}>
            <View style={styles.flex}><Button label="Verify" small block onPress={() => set(o.id, true)} /></View>
            <View style={styles.flex}><Button label="Reject" small block variant="ghost" onPress={() => set(o.id, false)} /></View>
          </View>
        </View>
      ))}
    </>
  );
}

function Reports() {
  const rows = useLive<ReportRow[]>(db ? () => (cb) => onSnapshot(
    query(collection(db!, 'reports'), orderBy('at', 'desc')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReportRow, 'id'>) }))),
    () => {},
  ) : null, [], []);
  return (
    <>
      <Text style={styles.h}>Reports ({rows.length})</Text>
      {rows.length ? null : <Text style={styles.meta}>No reports.</Text>}
      {rows.slice(0, 20).map((r) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.title}>{r.targetType} {r.targetId.slice(0, 8)}</Text>
          <Text style={styles.body}>{r.reason}</Text>
          {r.targetType === 'post' ? <Button label="Take post down" small variant="ghost" onPress={() => { setStatus(r.targetId, 'rejected').catch(() => {}); }} /> : null}
        </View>
      ))}
    </>
  );
}

export default function AdminPanel() {
  const pending = postsBy('pending');
  const live = postsBy('approved');
  return (
    <>
      <Text style={styles.h}>Posts to review ({pending.length})</Text>
      {pending.length ? null : <Text style={styles.meta}>Nothing waiting.</Text>}
      {pending.map((p) => <PostCard key={p.id} p={p} review />)}
      <Orgs />
      <Text style={styles.h}>Live posts ({live.length})</Text>
      {live.map((p) => <PostCard key={p.id} p={p} review={false} />)}
      <Reports />
    </>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: space.l },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: space.m, gap: 4, marginTop: space.s },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 13, color: colors.slate },
  body: { fontSize: 14, color: colors.ink },
  row: { flexDirection: 'row', gap: space.s, marginTop: space.s },
  flex: { flex: 1 },
  thumb: { width: 110, height: 110, borderRadius: radius.s, marginRight: space.s, marginTop: space.s },
});
