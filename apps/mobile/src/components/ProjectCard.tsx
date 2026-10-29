import { Pressable, StyleSheet, Text, View } from 'react-native';

import { pledgedPct, type Project } from '../data';
import { inr } from '../format';
import { Rich, useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, shadow, space, type } from '../theme';
import { CoverArt } from './Art';
import { Button, CauseBadge, ProgressBar, SampleTag, StatusBadge, UntrTag } from './ui';

// Project card as in the prototype: cover, status and cause, pledged progress, then "I can help" + "Details"
// (or "See the results" once completed).
export default function ProjectCard({ project: p }: { project: Project }) {
  const { t, tr } = useT();
  const { open, showSheet } = useStore();
  const done = p.status === 'Completed';
  const pct = pledgedPct(p);
  const openIt = () => open({ name: 'project', id: p.id });
  return (
    <View style={styles.card}>
      <Pressable onPress={openIt} accessibilityRole="button" accessibilityLabel={`${p.title}. ${p.org}, ${p.area}. ${t('c.pledgedOf', { a: inr(p.raised), b: inr(p.goal) })}`}>
        <View>
          <CoverArt cause={p.cat} id={p.id} height={150} />
          <View style={styles.badges}><StatusBadge project={p} /><CauseBadge cause={p.cat} /></View>
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{p.title}</Text>
          <View style={styles.meta}>
            <Text style={styles.metaText}>{p.org} · {p.area}</Text>
            <SampleTag label={t('c.sample')} />
            <UntrTag />
          </View>
          <ProgressBar value={pct} label={t('c.pledgedAria')} />
          <View style={styles.row}>
            <Rich text={tr('c.pledgedOf', { a: inr(p.raised), b: inr(p.goal) })} style={styles.amount} boldStyle={styles.amountBold} />
            <Text style={styles.days}>{done ? t('c.fullyPledged') : t('c.daysLeft', { n: p.days })}</Text>
          </View>
        </View>
      </Pressable>
      <View style={styles.foot}>
        {done ? (
          <Button label={t('c.results')} variant="ghost" small block onPress={openIt} style={styles.flex} />
        ) : (
          <>
            <Button label={t('c.help')} small onPress={() => showSheet({ kind: 'help', id: p.id })} style={styles.flex} />
            <Button label={t('c.details')} variant="ghost" small onPress={openIt} style={styles.flex} />
          </>
        )}
      </View>
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  card: { marginHorizontal: space.l, marginBottom: space.l, borderRadius: radius.m, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', boxShadow: shadow.card },
  badges: { position: 'absolute', left: 12, top: 12, right: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  body: { paddingHorizontal: space.l, paddingTop: 14, gap: 7 },
  title: { ...type.cardTitle, color: colors.ink },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, lineHeight: 18, color: colors.slate },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  amount: { fontSize: 13, lineHeight: 18, color: colors.slate, flexShrink: 1 },
  amountBold: { color: colors.ink, fontSize: 14 },
  days: { fontSize: 13, color: colors.slate },
  foot: { flexDirection: 'row', gap: 8, padding: space.l, paddingTop: 12 },
  flex: { flex: 1 },
});
const styles = cardStyles;
