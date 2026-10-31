// Full review of one post for an admin: everything the author entered (with readable labels), every photo (including photos of
// documents), the pinned place and how it was checked, the author's contact and history, automatic checks (green, amber or red) and
// the decision: Approve, Ask for changes or Reject, with a reason the author will see. English only (staff screen).
import { doc, getDoc, onSnapshot, updateDoc } from '@react-native-firebase/firestore';
import { collection, query, where } from '@react-native-firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { categories } from '../data';
import { db } from '../firebase';
import { inr } from '../format';
import { STRINGS } from '../i18n/strings.generated';
import { useLive } from '../state/communities';
import { usePostPhotos } from '../state/files';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme';
import Sheet from './Sheet';
import { Button } from './ui';

export type ReviewPost = { id: string; ownerId: string; flow: string; status: string; ownerName: string; at: number; data: Record<string, string> };

const HIDE = new Set(['lat', 'lng', 'geoName', 'locVia', 'locDist', 'pin', 'consent', 'accurate', 'private', 'files', 'cover', 'docs']);
const REASONS = ['Photo is not clear', 'Location cannot be found', 'Details are missing', 'Looks like a duplicate', 'Need is not clear', 'Contact details are missing'];
const EN = STRINGS.en as Record<string, string>;
const label = (flow: string, name: string) => (EN[`f.${flow}.${name}`] ?? EN[`f.${name}`] ?? name).replace(/<[^>]+>/g, '');
const WHO: Record<string, string> = { individual: 'An individual', org: 'An organisation', self: 'Themselves', family: 'A family member', friend: 'A friend', other: 'Someone else', email: 'Email', phone: 'Phone', whatsapp: 'WhatsApp', normal: 'Normal', high: 'High', emergency: 'Emergency' };
const show = (name: string, v: string) => {
  if (name === 'cat') return categories.find((c) => c.id === v)?.id ? (EN[`cat.${v}`] ?? v) : v;
  if (name === 'goal' || name === 'budget') return inr(Number(v));
  return WHO[v] ?? v;
};

type Check = { ok: 'yes' | 'warn' | 'no'; text: string };
const ICON = { yes: '✓', warn: '!', no: '✕' } as const;
const TONE = { yes: colors.leaf, warn: '#B45309', no: colors.brick } as const;

export default function AdminReview({ post, others, onClose }: { post: ReviewPost; others: ReviewPost[]; onClose: () => void }) {
  const { user, toast } = useStore();
  const d = post.data;
  const photos = usePostPhotos(post.id);
  const [contact, setContact] = useState<{ private: string; email: string } | null>(null);
  const [joined, setJoined] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useLive<{ id: string; status: string }[]>(db && post.ownerId ? () => (cb) => onSnapshot(
    query(collection(db!, 'posts'), where('ownerId', '==', post.ownerId)),
    (s) => cb(s.docs.map((x) => ({ id: x.id, status: String(x.data().status ?? '') }))),
    () => cb([]),
  ) : null, [], [post.ownerId]);

  useEffect(() => {
    getDoc(doc(db!, 'posts', post.id, 'private', 'info')).then((s) => { const x = s.data(); setContact(x ? { private: String(x.private ?? ''), email: String(x.ownerEmail ?? '') } : null); }).catch(() => undefined);
    if (post.ownerId) getDoc(doc(db!, 'users', post.ownerId)).then((s) => setJoined(Number(s.data()?.createdAt ?? 0))).catch(() => undefined);
  }, [post.id, post.ownerId]);

  const fund = post.flow === 'fund';
  const docs = photos.filter((p) => p.field === 'docs');
  const pics = photos.filter((p) => p.field !== 'docs');
  const dist = Number(d.locDist || 0);
  const text = (d.desc || d.story || '').trim();
  const dup = others.filter((o) => o.id !== post.id && ((o.data.title || '').trim().toLowerCase() === (d.title || '').trim().toLowerCase() || (o.ownerId === post.ownerId && o.data.lat && d.lat && Math.abs(Number(o.data.lat) - Number(d.lat)) < 0.0009 && Math.abs(Number(o.data.lng) - Number(d.lng)) < 0.0009)));
  const rejected = history.filter((h) => h.status === 'rejected').length;

  const checks: Check[] = useMemo(() => {
    const c: Check[] = [];
    c.push({ ok: pics.length ? 'yes' : 'no', text: pics.length ? `${pics.length} photo(s) attached` : 'No photo attached' });
    if (d.lat) {
      c.push({ ok: d.geoName ? 'yes' : 'warn', text: d.geoName ? 'Pin resolves to a real mapped place in India' : 'Pin was not checked against the map' });
      c.push({ ok: d.locVia === 'gps' ? 'yes' : dist && dist < 2000 ? 'warn' : 'warn', text: d.locVia === 'gps' ? 'Poster was at the spot (GPS matched within 300 m)' : dist ? `Poster's phone was ${dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${dist} m`} from the pin` : d.locVia === 'search' ? 'Found by map search, GPS not used' : 'Placed on the map, GPS not used' });
    } else {
      c.push({ ok: fund ? 'warn' : 'no', text: fund ? 'No map location (optional for fundraisers)' : 'No map location' });
    }
    c.push({ ok: text.length >= 80 ? 'yes' : text.length >= 30 ? 'warn' : 'no', text: `Description is ${text.length} characters${text.length < 80 ? ' (short)' : ''}` });
    c.push({ ok: contact?.private ? 'yes' : 'no', text: contact?.private ? 'Private contact provided' : 'No private contact' });
    if (fund) {
      c.push({ ok: /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9]{1,}$/.test(d.payLink || '') ? 'yes' : 'no', text: /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9]{1,}$/.test(d.payLink || '') ? `UPI ID looks valid (${d.payLink})` : 'UPI ID missing or invalid' });
      c.push({ ok: docs.length ? 'yes' : 'no', text: docs.length ? `${docs.length} document photo(s) for verification` : 'No document photo' });
      c.push({ ok: Number(d.goal) >= 1000 && Number(d.goal) <= 5000000 ? 'yes' : 'warn', text: `Goal ${inr(Number(d.goal) || 0)}` });
    }
    c.push({ ok: dup.length ? 'warn' : 'yes', text: dup.length ? `Possible duplicate of ${dup.length} other post(s): ${dup.map((o) => o.data.title).join(', ').slice(0, 80)}` : 'No duplicate found' });
    c.push({ ok: rejected > 1 ? 'warn' : 'yes', text: rejected ? `Author has ${rejected} rejected post(s) before` : 'Author has no rejected posts' });
    return c;
  }, [pics.length, docs.length, text.length, contact?.private, dup.length, rejected, d.lat, d.geoName, d.locVia, d.payLink, d.goal, dist, fund]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocking = checks.filter((c) => c.ok === 'no').length;
  const decide = (status: 'approved' | 'rejected', kind: 'approved' | 'changes' | 'rejected') => {
    if (status === 'rejected' && note.trim().length < 5) { toast('Write a short reason for the author'); return; }
    setBusy(true);
    updateDoc(doc(db!, 'posts', post.id), { status, reviewedAt: Date.now(), reviewedBy: user?.uid ?? '', reviewKind: kind, reviewNote: status === 'rejected' ? note.trim() : '' })
      .then(() => { toast(kind === 'approved' ? 'Approved' : kind === 'changes' ? 'Sent back to the author' : 'Rejected'); onClose(); })
      .catch(() => toast('Could not save'))
      .finally(() => setBusy(false));
  };

  const fields = Object.entries(d).filter(([k, v]) => !HIDE.has(k) && String(v).trim() !== '' && String(v) !== 'false');
  return (
    <Sheet visible onClose={onClose} title={d.title || '(no title)'} subtitle={`${post.flow} · ${new Date(post.at).toLocaleString()}`}>
      <Text style={styles.h}>Checks</Text>
      <View style={styles.box}>
        {checks.map((c, i) => (
          <View key={i} style={styles.row}>
            <Text style={[styles.mark, { color: TONE[c.ok] }]}>{ICON[c.ok]}</Text>
            <Text style={styles.line}>{c.text}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.hint}>{blocking ? `${blocking} thing(s) need attention before you approve.` : 'Nothing blocking. Read the details below, then decide.'}</Text>

      {pics.length ? <><Text style={styles.h}>Photos</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{pics.map((p) => <Image key={p.id} source={{ uri: `data:image/jpeg;base64,${p.b64}` }} style={styles.photo} />)}</ScrollView></> : null}
      {docs.length ? <><Text style={styles.h}>Documents (private)</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{docs.map((p) => <Image key={p.id} source={{ uri: `data:image/jpeg;base64,${p.b64}` }} style={styles.photo} />)}</ScrollView></> : null}

      {d.lat ? (
        <>
          <Text style={styles.h}>Location</Text>
          <Text style={styles.line}>📍 {d.geoName || `${d.lat}, ${d.lng}`}</Text>
          <Text style={styles.hint}>{d.lat}, {d.lng}</Text>
          <Button label="Open in Google Maps" small variant="ghost" onPress={() => { Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}`).catch(() => undefined); }} />
        </>
      ) : null}

      <Text style={styles.h}>Everything the author wrote</Text>
      <View style={styles.box}>
        {fields.map(([k, v]) => (
          <View key={k} style={styles.field}>
            <Text style={styles.fl}>{label(post.flow, k)}</Text>
            <Text style={styles.fv}>{show(k, String(v))}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.h}>Author</Text>
      <View style={styles.box}>
        <View style={styles.field}><Text style={styles.fl}>Name</Text><Text style={styles.fv}>{post.ownerName || '—'}</Text></View>
        <View style={styles.field}><Text style={styles.fl}>Email</Text><Text style={styles.fv}>{contact?.email || '—'}</Text></View>
        <View style={styles.field}><Text style={styles.fl}>Contact they gave</Text><Text style={styles.fv}>{contact?.private || '—'}</Text></View>
        <View style={styles.field}><Text style={styles.fl}>Joined</Text><Text style={styles.fv}>{joined ? new Date(joined).toLocaleDateString() : 'before records began'}</Text></View>
        <View style={styles.field}><Text style={styles.fl}>Posts so far</Text><Text style={styles.fv}>{history.length} ({history.filter((h) => h.status === 'approved').length} live, {rejected} rejected)</Text></View>
      </View>
      {contact?.private && /^[+\d][\d\s-]{8,}$/.test(contact.private) ? <Button label="Call the author" small variant="ghost" onPress={() => { Linking.openURL(`tel:${contact.private.replace(/\s/g, '')}`).catch(() => undefined); }} /> : null}
      {contact?.email ? <Button label="Email the author" small variant="ghost" onPress={() => { Linking.openURL(`mailto:${contact.email}?subject=${encodeURIComponent(d.title || 'Your GoodNeighbour post')}`).catch(() => undefined); }} /> : null}

      <Text style={styles.h}>Decision</Text>
      <Button label="Approve and publish" block disabled={busy} onPress={() => decide('approved', 'approved')} />
      <Text style={styles.hint}>To ask for changes or reject, give a reason. The author sees it and can edit and send the post again.</Text>
      <View style={styles.chips}>
        {REASONS.map((r) => <Text key={r} onPress={() => setNote(r)} accessibilityRole="button" style={[styles.chip, note === r && styles.chipOn]}>{r}</Text>)}
      </View>
      <TextInput value={note} onChangeText={setNote} placeholder="Reason for the author…" placeholderTextColor={colors.slate} multiline maxLength={300} style={styles.input} accessibilityLabel="Reason" />
      <View style={styles.row}>
        <View style={styles.flex}><Button label="Ask for changes" small block variant="ghost" disabled={busy} onPress={() => decide('rejected', 'changes')} /></View>
        <View style={styles.flex}><Button label="Reject" small block variant="ghost" disabled={busy} onPress={() => decide('rejected', 'rejected')} /></View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: space.s },
  box: { gap: 6, padding: space.m, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s },
  mark: { width: 18, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  line: { flex: 1, fontSize: 14, color: colors.ink },
  hint: { fontSize: 13, color: colors.slate },
  photo: { width: 220, height: 165, borderRadius: radius.m, marginRight: space.s },
  field: { gap: 1 },
  fl: { fontSize: 12, fontWeight: '800', color: colors.tealDeep },
  fv: { fontSize: 15, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.line, color: colors.slate, fontSize: 13, fontWeight: '700', overflow: 'hidden' },
  chipOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark, color: colors.white },
  input: { minHeight: 70, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.m, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink, textAlignVertical: 'top', backgroundColor: colors.white },
  flex: { flex: 1 },
});
