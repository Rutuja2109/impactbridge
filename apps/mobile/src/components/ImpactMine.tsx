// Impact page sections for the person's own badges, certificates, and donations & SIPs (moved here from the profile drawer).
// Everything is computed from this session's demo activity; nothing is sent anywhere.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { campaignOf } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { badgesFor, certificatesFor, type Certificate } from '../state/achievements';
import { firebaseReady } from '../firebase';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';
import Icon from './Icon';
import { LogoMark } from './Logo';
import Sheet from './Sheet';
import { Badge as Pill, Button, CauseBadge, SampleTag } from './ui';

export function CertificateCard({ cert }: { cert: Certificate }) {
  const { t, formatDate } = useT();
  const text = cert.kind === 'volunteer'
    ? t('n.certVol', { h: cert.hours, a: t(`va.${cert.activity}`) })
    : t(cert.monthly ? 'n.certDonM' : 'n.certDon', { c: campaignOf(cert.cid)?.title ?? '', a: inr(cert.amount) });
  return (
    <View style={styles.cert} accessible>
      <LogoMark size={44} />
      <Text style={styles.certKicker}>GOODNEIGHBOUR</Text>
      <Text style={styles.certTitle}>{t(cert.kind === 'volunteer' ? 'n.certVolT' : 'n.certDonT')}</Text>
      <Text style={styles.small}>{t('n.certTo')}</Text>
      <Text style={styles.certName}>{t('n.guest')}</Text>
      <Text style={styles.certBody}>{text}</Text>
      {cert.kind === 'volunteer' ? <Text style={styles.small}>{formatDate(cert.date, { day: 'numeric', month: 'long', year: 'numeric' })}</Text> : null}
      <View style={styles.certRule} />
      <Text style={styles.certDemo}>{t('n.certDemo')}</Text>
    </View>
  );
}

export default function ImpactMine() {
  const { t } = useT();
  const store = useStore();
  const [cert, setCert] = useState<Certificate | null>(null);
  const activity = { myDonations: store.myDonations, sips: store.sips, joined: store.joined, going: store.going, following: store.following };
  const badges = badgesFor(activity);
  const certs = certificatesFor(activity);

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
            <Pill label={b.earned ? t('n.earned') : t('n.locked')} tone={b.earned ? 'leaf' : 'grey'} />
          </View>
        ))}
        <Text style={styles.small}>{t('n.badgesNote')}</Text>
      </View>

      <View style={styles.sec}>
        <Text accessibilityRole="header" style={styles.h2}>{t('n.myCerts')}</Text>
        {certs.length ? certs.map((c) => (
          <Pressable key={c.id} onPress={() => setCert(c)} accessibilityRole="button" style={styles.item}>
            <Icon name={c.kind === 'volunteer' ? 'hand' : 'heart'} size={20} color={colors.tealDark} />
            <View style={styles.grow}>
              <Text style={styles.itemTitle}>{t(c.kind === 'volunteer' ? 'n.certVolT' : 'n.certDonT')}</Text>
              <Text style={styles.small} numberOfLines={1}>{c.kind === 'volunteer' ? t(`va.${c.activity}`) : campaignOf(c.cid)?.title}</Text>
            </View>
            <Text style={styles.link}>{t('n.certView')}</Text>
          </Pressable>
        )) : <Text style={styles.small}>{t('n.certNone')}</Text>}
        {certs.length ? <Text style={styles.small}>{t('n.certDemo')}</Text> : null}
      </View>

      {firebaseReady ? null : <View style={styles.sec}>
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
      </View>}

      {cert ? <Sheet visible onClose={() => setCert(null)} title={t(cert.kind === 'volunteer' ? 'n.certVolT' : 'n.certDonT')}><CertificateCard cert={cert} /></Sheet> : null}
    </>
  );
}

const styles = StyleSheet.create({
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
  medal: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  medalOn: { backgroundColor: colors.tealDark, borderWidth: 3, borderColor: '#F5C451' },
  medalOff: { backgroundColor: colors.greySoft },
  cert: { alignItems: 'center', gap: 8, padding: space.xl, borderRadius: radius.m, borderWidth: 2, borderColor: '#E6C77A', backgroundColor: '#FFFCF3' },
  certKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 2, color: colors.tealDeep },
  certTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  certName: { fontSize: 24, fontWeight: '800', fontStyle: 'italic', color: colors.tealDeep },
  certBody: { ...type.body, color: colors.ink, textAlign: 'center' },
  certRule: { alignSelf: 'stretch', height: 1, backgroundColor: '#E6C77A', marginVertical: 6 },
  certDemo: { fontSize: 12, fontWeight: '700', color: colors.brick, textAlign: 'center' },
});
