import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { campaignPledged, campaignReceived, campaignSupporters, fundPct, type Campaign } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, shadow, space, type } from '../theme';
import { CoverArt } from './Art';
import Icon from './Icon';
import { Badge, Button, CauseBadge, ProgressBar, VerifyBadge } from './ui';

const GAP = 12;

// Trending fundraisers as a horizontal, snapping row (the pattern Ketto uses on its home screen): photo with badges,
// title, organiser, amount raised over the goal, progress, supporters and days left, and a direct Donate button.
// Amounts stay simulated, and pledges are shown separately from money received, as everywhere else in the app.
export default function TrendingCarousel({ items }: { items: Campaign[] }) {
  const { t } = useT();
  const { open, showSheet, donations } = useStore();
  const { width } = useWindowDimensions();
  const cardW = Math.min(320, Math.round(width * 0.8));
  const step = cardW + GAP;
  const [active, setActive] = useState(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.x / step)));
    if (i !== active) setActive(i);
  };

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingHorizontal: space.l, gap: GAP, paddingVertical: 6 }}
        accessibilityLabel={t('trend.title')}
      >
        {items.map((c) => {
          const ds = donations[c.id];
          const received = campaignReceived(c, ds);
          const pledged = campaignPledged(ds);
          const pct = fundPct(c, ds);
          const openIt = () => open({ name: 'campaign', id: c.id });
          return (
            <View key={c.id} style={[styles.card, { width: cardW }]}>
              <Pressable onPress={openIt} accessibilityRole="button" accessibilityLabel={`${c.title}. ${t('fund.recvOf', { a: inr(received), b: inr(c.goal) })}`}>
                <View>
                  <CoverArt cause={c.cat} id={c.id} height={150} placeholder={t('fund.placeholder')} />
                  <View style={styles.badges}>
                    <VerifyBadge status={c.verify} />
                    {c.urgent ? <Badge label={t('fund.urgent')} tone="brick" /> : null}
                  </View>
                </View>
                <View style={styles.body}>
                  <CauseBadge cause={c.cat} />
                  <Text style={styles.title} numberOfLines={2}>{c.title}</Text>
                  <Text style={styles.by} numberOfLines={1}>{t('cd.organizer')}: {c.organizer}</Text>
                  <View style={styles.amountRow}>
                    <Text style={styles.raised}>{inr(received)}</Text>
                    <Text style={styles.goal}> / {inr(c.goal)}</Text>
                  </View>
                  <ProgressBar value={pct} label={t('leg.simRecv')} height={8} />
                  <View style={styles.statsRow}>
                    <View style={styles.stat}><Icon name="people" size={15} color={colors.slate} /><Text style={styles.statText}>{campaignSupporters(c, ds)} {t('cd.supporters')}</Text></View>
                    <View style={styles.stat}><Icon name="clock" size={15} color={colors.slate} /><Text style={styles.statText}>{t('c.daysLeft', { n: c.days })}</Text></View>
                  </View>
                  {pledged ? <Text style={styles.note}>{t('fund.pledgedNote', { a: inr(pledged) })}</Text> : null}
                  <Text style={styles.note}>{t('leg.simRecv')}</Text>
                </View>
              </Pressable>
              <Button label={t('b.donate')} small block onPress={() => showSheet({ kind: 'donate', id: c.id })} accessibilityLabel={t('b.supportT', { t: c.title })} style={styles.donate} />
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.dots} accessibilityLabel={t('story.n', { n: active + 1, t: items.length })}>
        {items.map((c, i) => <View key={c.id} style={[styles.dot, i === active && styles.dotOn]} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.m, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', boxShadow: shadow.card },
  badges: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', gap: 6, flexWrap: 'wrap', right: 10 },
  body: { padding: 14, gap: 6 },
  title: { ...type.cardTitle, color: colors.ink, minHeight: 44 },
  by: { ...type.small, color: colors.slate },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  raised: { fontSize: 18, fontWeight: '800', color: colors.tealDeep },
  goal: { ...type.small, color: colors.slate },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 13, fontWeight: '700', color: colors.slate },
  note: { fontSize: 12, lineHeight: 16, color: colors.slate },
  donate: { marginHorizontal: 14, marginBottom: 14 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.m },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { width: 20, backgroundColor: colors.teal },
});
