import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Fundraiser } from '../data/sample';
import { inr, percent } from '../format';
import { colors, radius, shadow, space, type } from '../theme';
import { CoverArt } from './Art';
import Icon from './Icon';
import { CauseBadge, ProgressBar, SampleTag } from './ui';

type Props = { item: Fundraiser; onPress: (item: Fundraiser) => void };

export default function FundraiserCard({ item, onPress }: Props) {
  const pct = percent(item.raised, item.goal);
  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. Sample fundraiser by ${item.organiser}. ${inr(item.raised)} raised of ${inr(item.goal)}, ${item.daysLeft} days left.`}
      accessibilityHint="Campaign details are coming in a later step"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <CoverArt cause={item.cause} id={item.id} height={140} />
      <View style={styles.body}>
        <View style={styles.badges}>
          <CauseBadge cause={item.cause} />
          <SampleTag />
        </View>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.organiser} numberOfLines={1}>by {item.organiser}</Text>
        <ProgressBar value={pct} label={`${pct} percent of goal raised (sample)`} />
        <View style={styles.amountRow}>
          <Text style={styles.amount}>
            <Text style={styles.raised}>{inr(item.raised)}</Text> raised of {inr(item.goal)}
          </Text>
          <Text style={styles.pct}>{pct}%</Text>
        </View>
        <View style={styles.deadline}>
          <Icon name="clock" size={15} color={colors.slate} />
          <Text style={styles.deadlineText}>{item.daysLeft} days left</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.l,
    marginBottom: space.l,
    borderRadius: radius.m,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    boxShadow: shadow.card,
  },
  pressed: { opacity: 0.92 },
  body: { padding: space.l, gap: space.s },
  badges: { flexDirection: 'row', gap: space.s, alignItems: 'center', flexWrap: 'wrap' },
  title: { ...type.cardTitle, color: colors.ink },
  organiser: { ...type.small, color: colors.slate },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.s },
  amount: { ...type.small, color: colors.slate, flexShrink: 1 },
  raised: { fontSize: 16, fontWeight: '800', color: colors.ink },
  pct: { ...type.small, fontWeight: '800', color: colors.tealDark },
  deadline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deadlineText: { ...type.small, color: colors.slate },
});
