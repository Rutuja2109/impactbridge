import { StyleSheet, Text, View } from 'react-native';

import { causeById, type CauseId } from '../data/sample';
import { colors, radius, space, type } from '../theme';

export function SampleTag({ label = 'Sample' }: { label?: string }) {
  return (
    <View style={styles.sample}>
      <Text style={styles.sampleText}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function SectionHeader({ title, subtitle, tag }: { title: string; subtitle?: string; tag?: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
        {tag ? <SampleTag label={tag} /> : null}
      </View>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

export function CauseBadge({ cause }: { cause: CauseId }) {
  const c = causeById(cause);
  return (
    <View style={[styles.badge, { backgroundColor: c.soft }]}>
      <Text style={[styles.badgeText, { color: c.ink }]}>{c.name}</Text>
    </View>
  );
}

// A thin, rounded progress bar that reads its value out to screen readers.
export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <View
      style={styles.track}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: value }}
    >
      <View style={[styles.fill, { width: `${value}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  sample: { backgroundColor: colors.sampleBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  sampleText: { ...type.tiny, color: colors.slate, letterSpacing: 0.6 },
  section: { marginTop: space.xxl, marginBottom: space.m, paddingHorizontal: space.l },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexWrap: 'wrap' },
  sectionTitle: { ...type.title, color: colors.ink },
  sectionSub: { ...type.small, color: colors.slate, marginTop: 4 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { ...type.tiny, fontSize: 12 },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: '#EAF0EC', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.teal },
});
