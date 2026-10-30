// The person's own part of the Impact page: what they did (posts shared, help offered, communities joined), the badges that
// come from it, and a certificate for each badge. Everything is read from their account, and any badge or certificate can be
// shared as a picture. In Expo Go (no Firebase) it falls back to the local demo activity.
import * as Sharing from 'expo-sharing';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, Share, StyleSheet, Text, View, findNodeHandle } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { campaignOf } from '../data';
import { firebaseReady } from '../firebase';
import { inr } from '../format';
import { useT } from '../i18n';
import { badgesFor, certificatesFor, type Badge, type Certificate } from '../state/achievements';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';
import Icon from './Icon';
import { LogoMark } from './Logo';
import Sheet from './Sheet';
import { Badge as Pill, Button, CauseBadge, SampleTag } from './ui';

const iso = (ms: number) => new Date(ms || Date.now()).toISOString().slice(0, 10);

/** Turns a view into a picture and opens the phone's share sheet (WhatsApp, Instagram, Gmail ...). Falls back to plain text. */
async function shareView(node: ComponentRef<typeof View> | null, text: string) {
  try {
    const handle = node ? findNodeHandle(node) : null;
    if (handle && (await Sharing.isAvailableAsync())) {
      const uri = await captureRef(handle, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: text });
      return;
    }
  } catch { /* fall through to text */ }
  await Share.share({ message: text }).catch(() => undefined);
}

export function CertificateCard({ cert }: { cert: Certificate }) {
  const { t, formatDate } = useT();
  const { user } = useStore();
  const who = user?.name || t('n.guest');
  const text = cert.kind === 'badge' ? t(`n.cert.${cert.badge}`)
    : cert.kind === 'volunteer' ? t('n.certVol', { h: cert.hours, a: t(`va.${cert.activity}`) })
      : t(cert.monthly ? 'n.certDonM' : 'n.certDon', { c: campaignOf(cert.cid)?.title ?? '', a: inr(cert.amount) });
  const title = cert.kind === 'badge' ? t('n.cert.title') : t(cert.kind === 'volunteer' ? 'n.certVolT' : 'n.certDonT');
  return (
    <View style={styles.cert} accessible collapsable={false}>
      <LogoMark size={56} />
      <Text style={styles.certKicker}>GOODNEIGHBOUR</Text>
      <Text style={styles.certTitle}>{title}</Text>
      <Text style={styles.small}>{t('n.certTo')}</Text>
      <Text style={styles.certName}>{who}</Text>
      <Text style={styles.certBody}>{text}</Text>
      <Text style={styles.small}>{formatDate(cert.kind === 'volunteer' ? cert.date : iso(cert.kind === 'badge' ? cert.at : Date.now()), { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      <View style={styles.certRule} />
      <Text style={firebaseReady ? styles.certNote : styles.certDemo}>{firebaseReady ? t('n.cert.note') : t('n.certDemo')}</Text>
    </View>
  );
}

function BadgeCard({ b }: { b: Badge }) {
  const { t } = useT();
  const { user } = useStore();
  return (
    <View style={styles.badgeCard} collapsable={false}>
      <LogoMark size={40} />
      <View style={[styles.medalBig, styles.medalOn]}><Icon name={b.icon} size={44} color={colors.white} /></View>
      <Text style={styles.bcTitle}>{t(`n.b.${b.id}`)}</Text>
      <Text style={styles.bcWho}>{user?.name || t('n.guest')}</Text>
      <Text style={styles.small}>{t(`n.b.${b.id}D`)}</Text>
      <Text style={styles.bcTag}>GoodNeighbour · {t('home.tagline')}</Text>
    </View>
  );
}

type Shown = { kind: 'cert'; cert: Certificate } | { kind: 'badge'; badge: Badge } | null;

export default function ImpactMine() {
  const { t, formatDate } = useT();
  const store = useStore();
  const [shown, setShown] = useState<Shown>(null);
  const card = useRef<ComponentRef<typeof View>>(null);

  const activity = { myDonations: store.myDonations, sips: store.sips, joined: store.joined, going: store.going, following: store.following };
  const badges = badgesFor(activity);
  const certs = certificatesFor(activity);
  const share = () => {
    if (!shown) return;
    const label = shown.kind === 'badge' ? t(`n.b.${shown.badge.id}`) : t('n.cert.title');
    shareView(card.current, t('n.shareMsg', { b: label }));
  };

  return (
    <>

      <View style={styles.sec}>
        <Text accessibilityRole="header" style={styles.h2}>{t('n.myBadges')}</Text>
        {badges.map((b) => (
          <View key={b.id} style={[styles.badge, !b.earned && styles.badgeLocked]}>
            <View style={[styles.medal, b.earned ? styles.medalOn : styles.medalOff]}><Icon name={b.icon} size={22} color={b.earned ? colors.white : colors.slate} /></View>
            <View style={styles.grow}>
              <Text style={styles.itemTitle}>{t(`n.b.${b.id}`)}</Text>
              <Text style={styles.small}>{t(`n.b.${b.id}D`)}{b.progress && !b.earned ? `  ${b.progress[0]}/${b.progress[1]}` : ''}</Text>
            </View>
            {b.earned ? (
              <Pressable onPress={() => setShown({ kind: 'badge', badge: b })} accessibilityRole="button" accessibilityLabel={`${t('n.share')}: ${t(`n.b.${b.id}`)}`} style={styles.shareBtn} hitSlop={8}>
                <Icon name="share" size={18} color={colors.tealDark} />
                <Text style={styles.link}>{t('n.share')}</Text>
              </Pressable>
            ) : <Pill label={t('n.locked')} tone="grey" />}
          </View>
        ))}
        <Text style={styles.small}>{t(firebaseReady ? 'n.imp.badgesNote' : 'n.badgesNote')}</Text>
      </View>

      <View style={styles.sec}>
        <Text accessibilityRole="header" style={styles.h2}>{t('n.myCerts')}</Text>
        {certs.length ? certs.map((c) => (
          <Pressable key={c.id} onPress={() => setShown({ kind: 'cert', cert: c })} accessibilityRole="button" style={styles.item}>
            <Icon name="check" size={20} color={colors.tealDark} />
            <View style={styles.grow}>
              <Text style={styles.itemTitle}>{c.kind === 'badge' ? t('n.cert.title') : t(c.kind === 'volunteer' ? 'n.certVolT' : 'n.certDonT')}</Text>
              <Text style={styles.small} numberOfLines={1}>{c.kind === 'badge' ? t(`n.b.${c.badge}`) : c.kind === 'volunteer' ? t(`va.${c.activity}`) : campaignOf(c.cid)?.title}</Text>
            </View>
            <Text style={styles.link}>{t('n.certView')}</Text>
          </Pressable>
        )) : <Text style={styles.small}>{t('n.certNone2')}</Text>}
      </View>

        <View style={styles.sec}>
          <Text accessibilityRole="header" style={styles.h2}>{t('n.myGiving')}</Text>
          {store.sips.map((s) => (
            <View key={s.id} style={styles.item}>
              <View style={styles.grow}>
                <View style={styles.inline}><CauseBadge cause={s.cause} /><Text style={styles.itemTitle}>{t('n.perMonth', { a: inr(s.amount) })}</Text></View>
                <Text style={styles.small}>{t(s.status === 'active' ? 'n.sipActive' : s.status === 'paused' ? 'n.sipPaused' : 'n.sipCancelled')} · {s.started}</Text>
              </View>
              {s.status !== 'cancelled' ? (
                <View style={styles.inline}>
                  <Button small variant="ghost" label={t(s.status === 'active' ? 'n.pause' : 'n.resume')} onPress={() => store.setSipStatus(s.id, s.status === 'active' ? 'paused' : 'active')} />
                  <Button small variant="ghost" label={t('n.cancel')} onPress={() => store.setSipStatus(s.id, 'cancelled')} />
                </View>
              ) : null}
            </View>
          ))}
          {store.myDonations.filter((d) => !d.monthly).map((d, i) => (
            <View key={`${d.cid}-${i}`} style={styles.item}>
              <Text style={[styles.itemTitle, styles.grow]} numberOfLines={2}>{campaignOf(d.cid)?.title}</Text>
              <Text style={styles.itemTitle}>{inr(d.a)}</Text>
            </View>
          ))}
          {!store.sips.length && !store.myDonations.length ? <Text style={styles.small}>{t('n.givingNone')}</Text> : <SampleTag label={t('dn.simTag')} />}
        </View>

      {shown ? (
        <Sheet visible onClose={() => setShown(null)} title={shown.kind === 'badge' ? t(`n.b.${shown.badge.id}`) : t('n.cert.title')}>
          <View ref={card} collapsable={false} style={styles.capture}>
            {shown.kind === 'badge' ? <BadgeCard b={shown.badge} /> : <CertificateCard cert={shown.cert} />}
          </View>
          <Button label={t('n.share')} icon="share" block onPress={share} />
        </Sheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 10, paddingHorizontal: space.l, marginTop: space.l },
  tile: { flex: 1, backgroundColor: colors.tealSoft, borderRadius: radius.m, paddingVertical: 14, alignItems: 'center' },
  tileN: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.tealDeep },
  tileL: { fontSize: 12, lineHeight: 16, color: colors.tealDeep, textAlign: 'center', marginTop: 2, paddingHorizontal: 4 },
  sec: { paddingHorizontal: space.l, marginTop: space.xxl, gap: space.s },
  h2: { ...type.title, color: colors.ink },
  link: { fontSize: 15, fontWeight: '700', color: colors.tealDark },
  small: { ...type.small, color: colors.slate },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemTitle: { ...type.cardTitle, fontSize: 15, color: colors.ink },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.m, backgroundColor: colors.paper },
  badgeLocked: { opacity: 0.7 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  medal: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  medalBig: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  medalOn: { backgroundColor: colors.tealDark, borderWidth: 3, borderColor: '#F5C451' },
  medalOff: { backgroundColor: colors.greySoft },
  capture: { backgroundColor: colors.white, padding: 8, borderRadius: radius.m },
  badgeCard: { alignItems: 'center', gap: 8, padding: space.xl, borderRadius: radius.m, borderWidth: 2, borderColor: '#E6C77A', backgroundColor: '#FFFCF3' },
  bcTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  bcWho: { fontSize: 20, fontWeight: '800', fontStyle: 'italic', color: colors.tealDeep },
  bcTag: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colors.tealDeep, marginTop: 6 },
  cert: { alignItems: 'center', gap: 8, padding: space.xl, borderRadius: radius.m, borderWidth: 2, borderColor: '#E6C77A', backgroundColor: '#FFFCF3' },
  certKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 2, color: colors.tealDeep },
  certTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  certName: { fontSize: 24, fontWeight: '800', fontStyle: 'italic', color: colors.tealDeep, textAlign: 'center' },
  certBody: { ...type.body, color: colors.ink, textAlign: 'center' },
  certRule: { alignSelf: 'stretch', height: 1, backgroundColor: '#E6C77A', marginVertical: 6 },
  certDemo: { fontSize: 12, fontWeight: '700', color: colors.brick, textAlign: 'center' },
  certNote: { fontSize: 12, color: colors.slate, textAlign: 'center' },
});
