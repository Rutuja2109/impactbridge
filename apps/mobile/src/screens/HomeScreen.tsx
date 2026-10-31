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
import { campaignReceived, campaigns, campaignSupporters, categories, projects, stories } from '../data';
import { inr } from '../format';
import { firebaseReady } from '../firebase';
import { useT } from '../i18n';
import { useFeed } from '../state/feed';
import { useHelpRequests } from '../state/requests';
import { useStore } from '../state/store';
import { colors, radius, shadow, space, type } from '../theme';

// Home, in the prototype's order: hero + two actions, updates banner, "Choose a cause" panel,
// trending fundraisers, stories of change, needs near you.
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useT();
  const { showSheet, goTab, openDiscover, donations, unread: notesUnread, user } = useStore();
  const feed = useFeed(firebaseReady ? user?.uid : undefined);
  const reqs = useHelpRequests(firebaseReady ? user?.uid : undefined);
  const unread = notesUnread + (firebaseReady ? feed.unread + reqs.unread : 0);
  const needs = projects.filter((p) => p.status !== 'Completed');
  const causeW = Math.min(180, Math.round(width * 0.46));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: NAV_HEIGHT + insets.bottom + space.xxl }} showsVerticalScrollIndicator={false}>
      <HomeHero onNeedSupport={() => showSheet({ kind: 'post' })} onCanHelp={() => goTab('discover')} />

      <Pressable onPress={() => showSheet({ kind: 'updates' })} accessibilityRole="button" accessibilityLabel={t(firebaseReady ? 'n.live.updates' : 'upd.label')} style={({ pressed }) => [styles.updates, pressed && styles.pressed]}>
        <Icon name="bell" size={24} color={colors.tealDark} />
        <Text style={styles.updatesText}>{t(firebaseReady ? 'n.live.updates' : 'upd.label')}</Text>
        {unread ? <View style={styles.dot}><Text style={styles.dotText}>{unread}</Text></View> : null}
        <Icon name="chev" size={20} color={colors.slate} />
      </Pressable>

      {firebaseReady && reqs.waiting > 0 ? (
        <Pressable onPress={() => goTab('impact')} accessibilityRole="button" style={({ pressed }) => [styles.reqBanner, pressed && styles.pressed]}>
          <Icon name="hand" size={24} color={colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.reqTitle}>{t('hr.banner', { n: reqs.waiting })}</Text>
            <Text style={styles.reqSub}>{t('hr.bannerSub')}</Text>
          </View>
          <Icon name="chev" size={20} color={colors.white} />
        </Pressable>
      ) : null}

      {/* "Choose a cause" feature panel */}
      <View style={styles.feat}>
        <Gradient id="feat-bg" x2={0.6} stops={[{ offset: 0, color: colors.tealSoft }, { offset: 1, color: '#FFF4E0' }]} />
        <View style={styles.kickerRow}>
          <Text style={styles.kicker}>{t('feat.kicker').toUpperCase()}</Text>
          <SampleTag label={t('fund.sampleCampaigns')} />
        </View>
        <Text accessibilityRole="header" style={styles.featTitle}>{t('feat.title')}</Text>
        <Text style={styles.featSub}>{t('feat.sub')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={causeW + 22} decelerationRate="fast" contentContainerStyle={styles.causeRow} style={styles.causeScroll} accessibilityLabel={t('feat.aria')}>
          {categories.map((c) => {
            const mine = campaigns.filter((x) => x.cat === c.id);
            const amount = inr(mine.reduce((a, x) => a + campaignReceived(x, donations[x.id]), 0));
            // Real content has no "sample" or "simulated" wording; a cause with nothing yet shows no figure.
            const stat = firebaseReady ? (mine.length ? t('n.feat.live', { n: mine.length }) : '') : mine.length === 1 ? t('feat.stat1', { a: amount }) : t('feat.statN', { n: mine.length, a: amount });
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
                  {stat ? <Text style={styles.causeStat}>{stat}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <Button label={t('feat.cta')} block onPress={() => openDiscover({ kind: 'fund', cat: 'all' })} />
      </View>

      {firebaseReady && !needs.length && !campaigns.length ? (
        <View style={styles.empty}>
          <Text accessibilityRole="header" style={styles.emptyT}>{t('n.empty.t')}</Text>
          <Text style={styles.emptyD}>{t('n.empty.d')}</Text>
        </View>
      ) : null}
      {needs.length ? (
        <>
          <View style={styles.gap} />
          <SectionHeader title={t('n.nearTitle')} link={t('fund.seeAll')} onLink={() => openDiscover({ kind: 'projects', cat: 'all' })} subtitle={t('n.nearSub')} />
          <UntrNote style={styles.note} />
          <NeedsCarousel items={needs} />
        </>
      ) : null}

      {firebaseReady ? null : <SipPanel />}

      {stories.length ? (
        <>
          <View style={styles.gap} />
          <SectionHeader title={t('story.title')} subtitle={t('story.sub')} />
          <StoryCarousel />
        </>
      ) : null}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  pressed: { opacity: 0.85 },
  gap: { height: space.xl },
  empty: { marginHorizontal: space.l, marginTop: space.xl, padding: space.xl, gap: 8, borderRadius: radius.l, backgroundColor: colors.paper, alignItems: 'center' },
  emptyT: { ...type.title, color: colors.ink, textAlign: 'center' },
  emptyD: { ...type.body, color: colors.slate, textAlign: 'center' },
  updates: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: space.l, marginTop: space.xl, padding: 14,
    borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, boxShadow: shadow.card,
  },
  reqBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: space.l, marginTop: space.m, padding: space.m, borderRadius: radius.m, backgroundColor: colors.tealDark },
  reqTitle: { fontSize: 16, fontWeight: '800', color: colors.white },
  reqSub: { fontSize: 13, color: '#CFEFEE' },
  dot: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.brick, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontSize: 12, fontWeight: '800', color: colors.white },
  updatesText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.ink },
  feat: { marginHorizontal: space.l, marginTop: space.xxl, padding: 18, borderRadius: radius.l, overflow: 'hidden', gap: 10 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.tealDeep },
  featTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.tealDeep },
  featSub: { ...type.body, color: colors.slate },
  causeScroll: { marginHorizontal: -20 },
  causeRow: { paddingHorizontal: 20, gap: 22, paddingVertical: 10 },
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
