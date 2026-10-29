import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PortraitArt } from '../components/Art';
import Gradient, { Fill } from '../components/Gradient';
import { NAV_HEIGHT } from '../components/BottomNav';
import HomeHero from '../components/HomeHero';
import Icon from '../components/Icon';
import StoryCarousel from '../components/StoryCarousel';
import SipPanel from '../components/SipPanel';
import NeedsCarousel from '../components/NeedsCarousel';
import { Button, SampleTag, SectionHeader, UntrNote } from '../components/ui';
import { campaignReceived, campaigns, campaignSupporters, categories, projects } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, shadow, space, type } from '../theme';

// Home, in the prototype's order: hero + two actions, updates banner, "Choose a cause" panel,
// trending fundraisers, stories of change, needs near you.
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useT();
  const { showSheet, goTab, openDiscover, donations } = useStore();
  const needs = projects.filter((p) => p.status !== 'Completed');
  const causeW = Math.min(180, Math.round(width * 0.46));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: NAV_HEIGHT + insets.bottom + space.xxl }} showsVerticalScrollIndicator={false}>
      <HomeHero onNeedSupport={() => showSheet({ kind: 'post' })} onCanHelp={() => goTab('discover')} />

      <Pressable onPress={() => showSheet({ kind: 'updates' })} accessibilityRole="button" accessibilityLabel={t('upd.label')} style={({ pressed }) => [styles.updates, pressed && styles.pressed]}>
        <Icon name="bell" size={24} color={colors.tealDark} />
        <Text style={styles.updatesText}>{t('upd.label')}</Text>
        <Icon name="chev" size={20} color={colors.slate} />
      </Pressable>

      {/* "Choose a cause" feature panel */}
      <View style={styles.feat}>
        <Gradient id="feat-bg" x2={0.6} stops={[{ offset: 0, color: colors.tealSoft }, { offset: 1, color: '#FFF4E0' }]} />
        <View style={styles.kickerRow}>
          <Text style={styles.kicker}>{t('feat.kicker').toUpperCase()}</Text>
          <SampleTag label={t('fund.sampleCampaigns')} />
        </View>
        <Text accessibilityRole="header" style={styles.featTitle}>{t('feat.title')}</Text>
        <Text style={styles.featSub}>{t('feat.sub')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={causeW + 12} decelerationRate="fast" contentContainerStyle={styles.causeRow} style={styles.causeScroll} accessibilityLabel={t('feat.aria')}>
          {categories.map((c) => {
            const mine = campaigns.filter((x) => x.cat === c.id);
            const amount = inr(mine.reduce((a, x) => a + campaignReceived(x, donations[x.id]), 0));
            const stat = mine.length === 1 ? t('feat.stat1', { a: amount }) : t('feat.statN', { n: mine.length, a: amount });
            return (
              <Pressable
                key={c.id}
                onPress={() => openDiscover({ kind: 'fund', cat: c.id })}
                accessibilityRole="button"
                accessibilityLabel={`${t(`cat.${c.id}`)}. ${t(`catb.${c.id}`)}. ${stat}`}
                style={[styles.causeCard, { width: causeW }]}
              >
                <Fill>{(w, h) => <PortraitArt cause={c.id} id={`f-${c.id}`} width={w} height={h} />}</Fill>
                <Gradient id={`fade-${c.id}`} x2={0} stops={[{ offset: 0.2, color: '#002624', opacity: 0 }, { offset: 0.6, color: '#002624', opacity: 0.6 }, { offset: 1, color: '#002624', opacity: 0.92 }]} />
                <View style={styles.causeBody}>
                  <Text style={styles.causeName}>{t(`cat.${c.id}`)}</Text>
                  <Text style={styles.causeBlurb}>{t(`catb.${c.id}`)}</Text>
                  <Text style={styles.causeStat}>{stat}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <Button label={t('feat.cta')} block onPress={() => openDiscover({ kind: 'fund', cat: 'all' })} />
      </View>

      <View style={styles.gap} />
      <SectionHeader title={t('n.nearTitle')} link={t('fund.seeAll')} onLink={() => openDiscover({ kind: 'projects', cat: 'all' })} subtitle={t('n.nearSub')} />
      <UntrNote style={styles.note} />
      <NeedsCarousel items={needs} />

      <SipPanel />

      <View style={styles.gap} />
      <SectionHeader title={t('story.title')} subtitle={t('story.sub')} />
      <StoryCarousel />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  pressed: { opacity: 0.85 },
  gap: { height: space.xl },
  updates: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: space.l, marginTop: space.xl, padding: 14,
    borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, boxShadow: shadow.card,
  },
  updatesText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.ink },
  feat: { marginHorizontal: space.l, marginTop: space.xxl, padding: 18, borderRadius: radius.l, overflow: 'hidden', gap: 10 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.tealDeep },
  featTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.tealDeep },
  featSub: { ...type.body, color: colors.slate },
  causeScroll: { marginHorizontal: -20 },
  causeRow: { paddingHorizontal: 20, gap: 12, paddingVertical: 10 },
  causeCard: { aspectRatio: 4 / 5, borderRadius: radius.m, overflow: 'hidden', justifyContent: 'flex-end', boxShadow: shadow.card },
  causeBody: { padding: 12, gap: 4 },
  causeName: { fontSize: 17, lineHeight: 21, fontWeight: '800', color: colors.white },
  causeBlurb: { fontSize: 12, lineHeight: 16, color: colors.white },
  causeStat: { alignSelf: 'flex-start', fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.white, backgroundColor: 'rgba(255, 255, 255, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  note: { marginHorizontal: space.l, marginBottom: space.l },
  sip: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: space.l, marginTop: space.xl, padding: 16, borderRadius: radius.m, backgroundColor: '#FFF4E0', borderWidth: 1, borderColor: '#F5D9A8' },
  sipIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.tealDark, alignItems: 'center', justifyContent: 'center' },
  sipText: { flex: 1, gap: 4 },
  sipTitle: { ...type.cardTitle, color: colors.ink },
  sipDesc: { ...type.small, color: colors.slate },
});
