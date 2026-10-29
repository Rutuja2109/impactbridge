import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { PortraitArt } from '../components/Art';
import { NAV_HEIGHT } from '../components/BottomNav';
import CampaignCard from '../components/CampaignCard';
import HomeHero from '../components/HomeHero';
import Icon from '../components/Icon';
import ProjectCard from '../components/ProjectCard';
import StoryCarousel from '../components/StoryCarousel';
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
  const trending = [...campaigns].sort((a, b) => campaignSupporters(b, donations[b.id]) - campaignSupporters(a, donations[a.id])).slice(0, 4);
  const nearby = projects.filter((p) => p.status !== 'Completed').slice(0, 4);
  const causeW = Math.min(236, Math.round(width * 0.62));

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
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" accessible={false}>
          <Defs>
            <LinearGradient id="feat-bg" x1="0" y1="0" x2="0.6" y2="1">
              <Stop offset="0" stopColor={colors.tealSoft} />
              <Stop offset="1" stopColor="#FFF4E0" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#feat-bg)" />
        </Svg>
        <View style={styles.kickerRow}>
          <Text style={styles.kicker}>{t('feat.kicker').toUpperCase()}</Text>
          <SampleTag label={t('fund.sampleCampaigns')} />
        </View>
        <Text accessibilityRole="header" style={styles.featTitle}>{t('feat.title')}</Text>
        <Text style={styles.featSub}>{t('feat.sub')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={causeW + 14} decelerationRate="fast" contentContainerStyle={styles.causeRow} style={styles.causeScroll} accessibilityLabel={t('feat.aria')}>
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
                <PortraitArt cause={c.id} id={`f-${c.id}`} />
                <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" accessible={false}>
                  <Defs>
                    <LinearGradient id={`fade-${c.id}`} x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0.38" stopColor="#002624" stopOpacity={0} />
                      <Stop offset="1" stopColor="#002624" stopOpacity={0.86} />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill={`url(#fade-${c.id})`} />
                </Svg>
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

      <SectionHeader title={t('trend.title')} link={t('fund.seeAll')} onLink={() => openDiscover({ kind: 'fund', cat: 'all' })} subtitle={t('trend.sub')} tag={t('fund.sampleCampaigns')} />
      <UntrNote style={styles.note} />
      {trending.map((c) => <CampaignCard key={c.id} campaign={c} support />)}

      <SectionHeader title={t('story.title')} subtitle={t('story.sub')} />
      <StoryCarousel />

      <SectionHeader title={t('home.near')} link={t('home.viewAll')} onLink={() => openDiscover({ kind: 'projects', cat: 'all' })} subtitle={t('home.nearSub')} tag={t('c.sampleProjects')} />
      <UntrNote style={styles.note} />
      {nearby.map((p) => <ProjectCard key={p.id} project={p} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  pressed: { opacity: 0.85 },
  updates: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: space.l, marginTop: space.l, padding: 14,
    borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, boxShadow: shadow.card,
  },
  updatesText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.ink },
  feat: { marginHorizontal: space.l, marginTop: space.xl, padding: 20, borderRadius: radius.l, overflow: 'hidden', gap: 8 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.tealDeep },
  featTitle: { fontSize: 32, lineHeight: 38, fontWeight: '800', color: colors.tealDeep },
  featSub: { ...type.body, color: colors.slate },
  causeScroll: { marginHorizontal: -20 },
  causeRow: { paddingHorizontal: 20, gap: 14, paddingVertical: 8 },
  causeCard: { aspectRatio: 4 / 5, borderRadius: radius.m, overflow: 'hidden', justifyContent: 'flex-end', boxShadow: shadow.card },
  causeBody: { padding: 16, gap: 5 },
  causeName: { fontSize: 20, lineHeight: 25, fontWeight: '800', color: colors.white },
  causeBlurb: { fontSize: 14, lineHeight: 19, color: colors.white },
  causeStat: { alignSelf: 'flex-start', fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.white, backgroundColor: 'rgba(255, 255, 255, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  note: { marginHorizontal: space.l, marginBottom: space.m },
});
