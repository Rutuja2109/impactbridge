import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_HEIGHT } from '../components/BottomNav';
import FundraiserCard from '../components/FundraiserCard';
import Icon from '../components/Icon';
import ProjectRow from '../components/ProjectRow';
import StoryCarousel from '../components/StoryCarousel';
import { SampleTag, SectionHeader } from '../components/ui';
import { causeById, causes, fundraisers, projects, stories, updatesCount, type CauseId } from '../data/sample';
import { colors, radius, shadow, space, type } from '../theme';

const comingLater = (title: string, what: string) =>
  Alert.alert(title, `${what} comes in a later step. Everything on this screen is sample data.`);

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [cause, setCause] = useState<CauseId | null>(null);

  const shownFundraisers = useMemo(() => fundraisers.filter((f) => !cause || f.cause === cause).slice(0, 4), [cause]);
  const shownProjects = useMemo(() => projects.filter((p) => !cause || p.cause === cause), [cause]);
  const causeName = cause ? causeById(cause).name : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + space.m, paddingBottom: NAV_HEIGHT + insets.bottom + space.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Brand */}
      <View style={styles.brandRow}>
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Icon name="heart" size={18} color={colors.white} strokeWidth={2.4} />
          </View>
          <Text style={styles.brandName} accessibilityRole="header">GoodNeighbour</Text>
        </View>
        <SampleTag label="Sample data" />
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.welcome}>Welcome, neighbour</Text>
        <Text style={styles.tagline}>Small acts. Real change.</Text>
        <Text style={styles.heroSub}>Your community. Your people. Your impact.</Text>
      </View>
      <Text style={styles.demoNote}>Prototype build: every campaign, person, amount and story on this screen is sample data.</Text>

      {/* Community updates banner */}
      <Pressable
        onPress={() => comingLater('Community updates', 'The updates feed')}
        accessibilityRole="button"
        accessibilityLabel={`See the latest community updates. ${updatesCount} new sample updates.`}
        style={({ pressed }) => [styles.updates, pressed && styles.pressed]}
      >
        <View style={styles.updatesIcon}>
          <Icon name="bell" size={20} color={colors.tealDark} />
        </View>
        <Text style={styles.updatesText} numberOfLines={2}>See the latest community updates</Text>
        <View style={styles.newPill}>
          <Text style={styles.newPillText}>{updatesCount} new</Text>
        </View>
        <Icon name="chev" size={18} color={colors.slate} />
      </Pressable>

      {/* Causes */}
      <SectionHeader title="Explore by cause" subtitle={causeName ? `Showing ${causeName}. Tap it again to show all.` : 'Tap a cause to filter what you see.'} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.causeRow}>
        {causes.map((c) => {
          const selected = cause === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => setCause(selected ? null : c.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${c.name}. ${c.blurb}.`}
              accessibilityHint={selected ? 'Shows all causes again' : `Shows only ${c.name}`}
              style={({ pressed }) => [styles.causeCard, selected && styles.causeSelected, pressed && styles.pressed]}
            >
              <View style={[styles.causeIcon, { backgroundColor: c.soft }]}>
                <Icon name={c.id} size={24} color={c.ink} />
              </View>
              <Text style={styles.causeName} numberOfLines={2}>{c.name}</Text>
              <Text style={styles.causeBlurb} numberOfLines={2}>{c.blurb}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Trending fundraisers */}
      <SectionHeader title="Trending fundraisers" tag="Sample" subtitle="Most supporters in this demo. Amounts are sample figures, not real donations." />
      {shownFundraisers.length ? (
        shownFundraisers.map((f) => <FundraiserCard key={f.id} item={f} onPress={() => comingLater(f.title, 'Campaign details')} />)
      ) : (
        <Text style={styles.empty}>No sample fundraisers for {causeName} yet.</Text>
      )}

      {/* Stories */}
      <SectionHeader title="Neighbour stories" tag="Fictional" subtitle="Demo stories that show how real, verified stories could appear later." />
      <StoryCarousel items={stories} />

      {/* Nearby projects */}
      <SectionHeader title="Nearby community projects" tag="Sample" subtitle="Sample projects around Pune. Your location is not used." />
      {shownProjects.length ? (
        shownProjects.map((p) => <ProjectRow key={p.id} item={p} onPress={() => comingLater(p.title, 'Project details')} />)
      ) : (
        <Text style={styles.empty}>No sample projects for {causeName} yet.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  pressed: { opacity: 0.85 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.l, gap: space.m },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexShrink: 1 },
  mark: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.tealDark, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 20, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  hero: {
    marginHorizontal: space.l,
    marginTop: space.l,
    padding: space.xl,
    borderRadius: radius.l,
    backgroundColor: colors.tealSoft,
  },
  welcome: { ...type.small, fontWeight: '700', color: colors.tealDeep },
  tagline: { ...type.display, color: colors.tealDeep, marginTop: space.xs },
  heroSub: { ...type.body, color: colors.ink, marginTop: space.s },
  demoNote: { ...type.small, color: colors.slate, marginHorizontal: space.l, marginTop: space.m },
  updates: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    marginHorizontal: space.l,
    marginTop: space.l,
    padding: space.m,
    paddingLeft: space.m,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    boxShadow: shadow.card,
  },
  updatesIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  updatesText: { ...type.cardTitle, fontSize: 15, color: colors.ink, flex: 1 },
  newPill: { backgroundColor: colors.tealDark, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  newPillText: { ...type.tiny, color: colors.white },
  causeRow: { paddingHorizontal: space.l, gap: space.m, paddingBottom: space.xs },
  causeCard: {
    width: 120,
    padding: space.m,
    borderRadius: radius.m,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    gap: space.s,
  },
  causeSelected: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  causeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  causeName: { ...type.cardTitle, fontSize: 15, color: colors.ink },
  causeBlurb: { ...type.small, fontSize: 12, lineHeight: 16, color: colors.slate },
  empty: { ...type.body, color: colors.slate, marginHorizontal: space.l, paddingVertical: space.l },
});
