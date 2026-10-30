// One of the person's own posts, opened from the Impact page. Works at every stage, including "waiting for review" (when the post
// is not yet in Discover): shows its status, photos and details, who offered help, and for a fundraiser the payments to confirm.
import { collection, doc, onSnapshot } from '@react-native-firebase/firestore';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { db } from '../firebase';
import { useT } from '../i18n';
import { useLive } from '../state/communities';
import { usePostPhotos } from '../state/files';
import { loadForEdit } from '../state/posts';
import { type MyPost } from '../state/mine';
import { freshPost } from '../state/post';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';
import DonationsList from './DonationsList';
import Sheet from './Sheet';
import { Badge as Pill, Button, Notice } from './ui';

type Full = { data: Record<string, unknown>; status: string } | null;
type Offer = { uid: string; name: string; email: string; kind: string; at: number };

const text = (v: unknown) => (typeof v === 'string' ? v : '');

export default function MyPostSheet({ post, onClose }: { post: MyPost; onClose: () => void }) {
  const { t, formatDate } = useT();
  const { open, setPost, toast } = useStore();
  const [, tick] = useState(0);
  const [editing, setEditing] = useState(false);
  const full = useLive<Full>(db ? () => (cb) => onSnapshot(doc(db!, 'posts', post.id), (s) => cb(s.exists() ? { data: (s.data()?.data ?? {}) as Record<string, unknown>, status: String(s.data()?.status ?? 'pending') } : null), () => cb(null)) : null, null, [post.id]);
  const offers = useLive<Offer[]>(db ? () => (cb) => onSnapshot(collection(db!, 'posts', post.id, 'responses'), (s) => cb(s.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Offer, 'uid'>) })).sort((a, b) => b.at - a.at)), () => cb([])) : null, [], [post.id]);
  const photos = usePostPhotos(post.id);

  const status = (full?.status ?? post.status) as string;
  const st = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';
  const d = full?.data ?? {};
  const where = [text(d.area), text(d.city)].filter(Boolean).join(', ');
  const about = text(d.desc) || text(d.story);
  // Opens the post form filled with this post; sending it again puts it back in review.
  const edit = () => {
    setEditing(true);
    loadForEdit(post.id)
      .then((r) => {
        if (!r) { toast(t('n.cm.fail')); return; }
        setPost(r.flow, () => ({ ...freshPost(), data: r.data, editId: post.id, max: 5, restored: true }));
        onClose();
        open({ name: 'post', flow: r.flow });
      })
      .catch(() => toast(t('n.cm.fail')))
      .finally(() => setEditing(false));
  };
  const goLive = () => { onClose(); open({ name: post.flow === 'fund' ? 'campaign' : 'project', id: post.id }); tick((x) => x + 1); };

  return (
    <Sheet visible onClose={onClose} title={post.title || t('mp.title')} subtitle={t(`mp.flow.${post.flow}`)}>
      <View style={styles.row}>
        <Pill label={t(`n.imp.st.${st}`)} tone={st === 'approved' ? 'leaf' : st === 'rejected' ? 'brick' : 'amber'} />
        <Text style={styles.small}>{formatDate(new Date(post.at || Date.now()).toISOString().slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      </View>
      <Notice tone={st === 'approved' ? 'green' : st === 'rejected' ? 'red' : 'blue'} text={t(`mp.${st}`)} />

      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {photos.map((p) => <Image key={p.id} source={{ uri: `data:image/jpeg;base64,${p.b64}` }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />)}
        </ScrollView>
      ) : null}

      {where ? <Text style={styles.line}>📍 {where}</Text> : null}
      {text(d.lat) ? <Text style={styles.small}>{t('mp.pinned')}</Text> : null}
      {about ? <Text style={styles.body}>{about}</Text> : null}
      {text(d.help) ? <Text style={styles.body}>{t('mp.help')}: {text(d.help)}</Text> : null}
      {post.flow === 'fund' && text(d.goal) ? <Text style={styles.line}>{t('mp.goal')}: ₹{text(d.goal)} · UPI {text(d.payLink)}</Text> : null}

      <Button label={t('mp.edit')} variant="ghost" block disabled={editing} onPress={edit} />
      {st === 'approved' ? <Text style={styles.small}>{t('mp.editWarn')}</Text> : null}

      {st === 'approved' ? (
        <>
          <Text style={styles.h3}>{t('mp.offers', { n: offers.length })}</Text>
          {offers.length ? offers.map((o) => (
            <Text key={o.uid} style={styles.line}>• {o.name} · {t(o.kind === 'volunteer' ? 'mp.vol' : 'mp.items')} · {o.email}</Text>
          )) : <Text style={styles.small}>{t('mp.noOffers')}</Text>}
          {post.flow === 'fund' ? (
            <>
              <Text style={styles.h3}>{t('mp.payments')}</Text>
              <DonationsList postId={post.id} />
            </>
          ) : null}
          <Button label={t('mp.open')} block onPress={goLive} />
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexWrap: 'wrap' },
  photo: { width: 200, height: 150, borderRadius: radius.m, marginRight: space.s },
  small: { ...type.small, color: colors.slate },
  line: { ...type.body, color: colors.ink },
  body: { ...type.body, color: colors.ink },
  h3: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: space.m },
});
