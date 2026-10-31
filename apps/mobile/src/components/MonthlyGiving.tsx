// "Monthly giving" on the Home screen: a swipeable row of cause cards, each tied to one NGO the admin has set up. Tap a card to read about
// the NGO and start giving every month. Shown only when the admin has switched monthly giving on and added at least one cause.
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { catOf, type CauseId } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { minTier } from '../sheets/MonthlySheet';
import { useSipConfig } from '../state/sip';
import { useActiveSipCauses, useCauseDonors, type SipCause } from '../state/sipCauses';
import { useStore } from '../state/store';
import { colors, radius, shadow, space } from '../theme';
import Icon, { type IconName } from './Icon';

function Card({ c, w }: { c: SipCause; w: number }) {
  const { t } = useT();
  const { showSheet } = useStore();
  const donors = useCauseDonors(c.id);
  const accent = catOf(c.cat as CauseId).color;
  return (
    <Pressable onPress={() => showSheet({ kind: 'monthly', id: c.id })} accessibilityRole="button" accessibilityLabel={`${c.title}. ${c.ngo}. ${t('mg.from', { a: inr(minTier(c)) })}`} style={({ pressed }) => [styles.card, { width: w }, pressed && styles.pressed]}>
      <View style={[styles.cover, { backgroundColor: accent }]}>
        {c.img ? <Image source={{ uri: `data:image/jpeg;base64,${c.img}` }} style={styles.coverImg} resizeMode="cover" accessibilityIgnoresInvertColors /> : <Icon name={c.cat as IconName} size={56} color="rgba(255,255,255,0.55)" />}
        <View style={styles.tag}><Text style={styles.tagText}>{t('mg.everyMonth')}</Text></View>
      </View>
      <View style={styles.logoRow}>
        <View style={[styles.logo, { borderColor: accent }]}>
          {c.logo ? <Image source={{ uri: `data:image/jpeg;base64,${c.logo}` }} style={styles.logoImg} /> : <Text style={[styles.logoLetter, { color: accent }]}>{(c.ngo || c.title).slice(0, 1).toUpperCase()}</Text>}
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{c.title}</Text>
        <Text style={styles.ngo} numberOfLines={1}>{c.ngo}{c.reg ? '  ✓' : ''}</Text>
        {c.about ? <Text style={styles.about} numberOfLines={2}>{c.about}</Text> : null}
        <View style={styles.row}>
          <Text style={styles.from}>{t('mg.from', { a: inr(minTier(c)) })}</Text>
          {donors > 0 ? <Text style={styles.donors}>♥ {t('mg.donorsN', { n: donors })}</Text> : null}
        </View>
        <View style={[styles.cta, { backgroundColor: colors.tealDark }]}><Text style={styles.ctaText}>{t('mg.give')}</Text></View>
      </View>
    </Pressable>
  );
}

export default function MonthlyGiving() {
  const { t } = useT();
  const { width } = useWindowDimensions();
  const cfg = useSipConfig();
  const causes = useActiveSipCauses();
  if (!cfg.enabled || !causes.length) return null;
  const w = Math.min(290, Math.round(width * 0.76));
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.kicker}>♥ {t('mg.kicker')}</Text>
        <Text accessibilityRole="header" style={styles.h}>{t('mg.homeTitle')}</Text>
        <Text style={styles.sub}>{t('mg.homeSub')}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={w + space.m} decelerationRate="fast" contentContainerStyle={styles.row2}>
        {causes.map((c) => <Card key={c.id} c={c} w={w} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xl, paddingVertical: space.l, backgroundColor: '#FFF7E8' },
  head: { paddingHorizontal: space.l, gap: 2, marginBottom: space.m },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: '#B45309' },
  h: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 15, lineHeight: 21, color: colors.slate },
  row2: { paddingHorizontal: space.l, gap: space.m, paddingBottom: space.s },
  card: { borderRadius: radius.l, backgroundColor: colors.white, overflow: 'hidden', boxShadow: shadow.card },
  pressed: { opacity: 0.85 },
  cover: { height: 130, alignItems: 'center', justifyContent: 'center' },
  coverImg: { width: '100%', height: '100%' },
  tag: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)' },
  tagText: { fontSize: 11, fontWeight: '800', color: colors.tealDeep },
  logoRow: { paddingHorizontal: space.m, marginTop: -26 },
  logo: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.white, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  logoLetter: { fontSize: 22, fontWeight: '800' },
  body: { padding: space.m, paddingTop: space.s, gap: 4 },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '800', color: colors.ink },
  ngo: { fontSize: 13, fontWeight: '700', color: colors.slate },
  about: { fontSize: 14, lineHeight: 20, color: colors.slate },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.s },
  from: { fontSize: 14, fontWeight: '800', color: colors.tealDeep },
  donors: { fontSize: 12, fontWeight: '700', color: colors.heart },
  cta: { marginTop: space.s, paddingVertical: 12, borderRadius: 999, alignItems: 'center' },
  ctaText: { fontSize: 15, fontWeight: '800', color: colors.white },
});
