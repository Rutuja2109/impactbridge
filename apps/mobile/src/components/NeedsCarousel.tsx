import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { pledgedPct, type Project } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, shadow, space, type } from '../theme';
import { CoverArt } from './Art';
import Icon, { type IconName } from './Icon';
import { Badge, Button, CauseBadge, ProgressBar } from './ui';

const GAP = 22;

// "Problems near you": open needs from local organisations, as a horizontal swipe row. Each card says what help is
// wanted in all three forms (money, volunteers, materials or skills) so a neighbour can pick how to help.
export default function NeedsCarousel({ items }: { items: Project[] }) {
  const { t } = useT();
  const { width } = useWindowDimensions();
  const cardW = Math.min(320, Math.round(width * 0.8));
  const [active, setActive] = useState(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.x / (cardW + GAP))));
    if (i !== active) setActive(i);
  };
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + GAP} decelerationRate="fast" onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={styles.row} accessibilityLabel={t('n.nearTitle')}>
        {items.map((p) => <NeedCard key={p.id} p={p} width={cardW} />)}
      </ScrollView>
      <View style={styles.dots}>
        {items.map((p, i) => <View key={p.id} style={[styles.dot, i === active && styles.dotOn]} />)}
      </View>
    </View>
  );
}

function Need({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.need}>
      <Icon name={icon} size={15} color={colors.tealDeep} />
      <Text style={styles.needText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function NeedCard({ p, width }: { p: Project; width: number }) {
  const { t } = useT();
  const { open, showSheet } = useStore();
  const openIt = () => open({ name: 'project', id: p.id });
  const vols = Math.max(0, p.volsNeeded - p.vols);
  const money = Math.max(0, p.goal - p.raised);
  // Items and skills are the entries in `needs` that are not volunteer slots.
  const items = p.needs.filter((n) => !/volunteer/i.test(n)).length;
  return (
    <View style={[styles.card, { width }]}>
      <Pressable onPress={openIt} accessibilityRole="button" accessibilityLabel={`${t('n.needTag')}. ${p.title}`}>
        <View>
          <CoverArt cause={p.cat} id={p.id} height={140} />
          <View style={styles.badges}><Badge label={t(p.status === 'Open' ? 'st.open' : 'st.progress')} tone={p.status === 'Open' ? 'teal' : 'amber'} /></View>
        </View>
        <View style={styles.body}>
          <CauseBadge cause={p.cat} />
          <Text style={styles.title} numberOfLines={2}>{p.title}</Text>
          <Text style={styles.by} numberOfLines={1}>{p.org} · {p.area}</Text>
          <ProgressBar value={pledgedPct(p)} label={t('c.pledgedAria')} height={8} />
          <View style={styles.needs}>
            {money > 0 ? <Need icon="coin" label={t('n.needMoney', { a: inr(money) })} /> : null}
            {vols > 0 ? <Need icon="hand" label={t(vols === 1 ? 'n.volNeeded1' : 'n.volsNeeded', { n: vols })} /> : null}
            {items > 0 ? <Need icon="tool" label={t('n.needItems', { n: items })} /> : null}
          </View>
          <Text style={styles.days}>{t('c.daysLeft', { n: p.days })}</Text>
        </View>
      </Pressable>
      <Button label={t('c.help')} small block onPress={() => showSheet({ kind: 'help', id: p.id })} style={styles.cta} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.l, gap: GAP, paddingVertical: 6 },
  card: { borderRadius: radius.m, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', boxShadow: shadow.card },
  badges: { position: 'absolute', left: 10, top: 10 },
  body: { padding: 14, gap: 8 },
  title: { ...type.cardTitle, color: colors.ink, minHeight: 44 },
  by: { ...type.small, color: colors.slate },
  needs: { gap: 6 },
  need: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.tealSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  needText: { fontSize: 13, fontWeight: '700', color: colors.tealDeep, flexShrink: 1 },
  days: { fontSize: 13, color: colors.slate },
  cta: { marginHorizontal: 14, marginBottom: 14 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.m },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { width: 20, backgroundColor: colors.teal },
});
