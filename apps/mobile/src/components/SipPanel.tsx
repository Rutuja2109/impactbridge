// Home SIP panel in Ketto's layout: soft peach card with a corner ribbon, serif-italic headline, givers stack,
// swipeable cause cards with an impact figure, "Starting at only ₹100/month" and "Find my plan".
// The ribbon says Demo instead of Ketto's "Tax benefit" (no tax claim can be made), and every figure is sample.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { categories, outcomes, type CauseId } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme';
import { PortraitArt } from './Art';
import { Fill } from './Gradient';
import Gradient from './Gradient';

const reported = (k: string) => outcomes.find((o) => o.k === k)?.reported ?? 0;
// Food and environment use the sample impact data; the other three are fixed sample figures.
const STAT: Record<CauseId, number> = { medical: 640, animals: 300, education: 180, food: reported('meals'), environment: reported('saplings') };
const GIVERS = ['#8D5A3B', '#E0AC82', '#C68B59'];

export default function SipPanel() {
  const { t } = useT();
  const { showSheet } = useStore();
  const head = t('n.sipHead');
  const em = t('n.sipEm');
  const [before, after] = head.includes(em) ? [head.slice(0, head.indexOf(em)), head.slice(head.indexOf(em) + em.length)] : [head, ''];

  return (
    <View style={styles.panel}>
      <View style={styles.ribbon}><Text style={styles.ribbonText}>★ {t('n.sipRibbon').toUpperCase()}</Text></View>
      <View style={styles.top}>
        <Text style={styles.head} accessibilityRole="header">
          {before}
          {head.includes(em) ? <Text style={styles.em}>{em}</Text> : null}
          {after}
        </Text>
        <View style={styles.givers}>
          <View style={styles.stack}>
            {GIVERS.map((c, i) => <View key={c} style={[styles.face, { backgroundColor: c, marginLeft: i ? -12 : 0 }]} />)}
          </View>
          <Text style={styles.giversText}>{t('n.sipDonors', { n: '1,240' })}</Text>
        </View>
      </View>
      <Text style={styles.desc}>{t('n.sipPanelD')}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={186} decelerationRate="fast" contentContainerStyle={styles.cards} style={styles.cardsScroll}>
        {categories.map((c) => (
          <Pressable key={c.id} onPress={() => showSheet({ kind: 'sip', cause: c.id })} accessibilityRole="button" accessibilityLabel={`${t(`cat.${c.id}`)}. ${t(`n.st.${c.id}`, { n: STAT[c.id].toLocaleString('en-IN') })}`} style={styles.card}>
            <Fill>{(w, h) => <PortraitArt cause={c.id} id={`sip-${c.id}`} width={w} height={h} />}</Fill>
            <Gradient id={`sipfade-${c.id}`} x2={0} stops={[{ offset: 0.35, color: '#000', opacity: 0 }, { offset: 1, color: '#000', opacity: 0.8 }]} />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{t(`cat.${c.id}`)}</Text>
              <Text style={styles.cardStat}>{t(`n.st.${c.id}`, { n: STAT[c.id].toLocaleString('en-IN') })}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.foot}>
        <View>
          <Text style={styles.from}>{t('n.sipFrom')}</Text>
          <Text style={styles.price}>{t('n.perMonth', { a: inr(100) })}</Text>
        </View>
        <Pressable onPress={() => showSheet({ kind: 'sip' })} accessibilityRole="button" style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
          <Text style={styles.ctaText}>{t('n.sipFind').toUpperCase()}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: space.l, marginTop: space.xxl, paddingTop: 40, paddingBottom: 24, paddingHorizontal: 24, borderRadius: 28, backgroundColor: '#FFF0C2' },
  ribbon: { position: 'absolute', top: 0, right: 28, backgroundColor: colors.tealDark, paddingHorizontal: 12, paddingVertical: 6, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  ribbonText: { color: colors.white, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  head: { flex: 1, fontSize: 32, lineHeight: 38, fontWeight: '800', color: colors.ink },
  em: { fontFamily: 'serif', fontStyle: 'italic', fontWeight: '700', color: '#B45309' },
  givers: { alignItems: 'center', gap: 6, maxWidth: 140 },
  stack: { flexDirection: 'row' },
  face: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#FFF0C2' },
  giversText: { fontSize: 13, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  desc: { fontSize: 15, lineHeight: 22, color: '#3D4A44', marginTop: space.m },
  cardsScroll: { marginHorizontal: -24, marginTop: space.xl },
  cards: { paddingHorizontal: 24, gap: 14 },
  card: { width: 172, height: 220, borderRadius: 18, overflow: 'hidden', borderWidth: 3, borderColor: colors.white, justifyContent: 'flex-end' },
  cardBody: { padding: 12, gap: 2 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  cardStat: { fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: space.xl },
  from: { fontSize: 14, color: '#3D4A44' },
  price: { fontSize: 26, fontWeight: '800', color: colors.ink },
  cta: { backgroundColor: '#D97706', borderRadius: radius.pill, paddingHorizontal: 24, paddingVertical: 14 },
  ctaText: { color: colors.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.6 },
});
