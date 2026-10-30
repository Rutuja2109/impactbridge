// The admin dashboard: the main numbers about the app in one place. Tap Refresh to count again.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { inr } from '../format';
import { useMetrics } from '../state/metrics';
import { colors, radius, space } from '../theme';
import { Button } from './ui';

export default function AdminMetrics() {
  const [tick, setTick] = useState(0);
  const { m, failed } = useMetrics(tick);
  const show = (v: number | undefined, money = false) => (v === undefined ? '—' : money ? inr(v) : v);
  const groups: [string, [string, string | number][]][] = m ? [
    ['People', [['Accounts', show(m.users)], ['New this week', show(m.users7)], ['Active this week', show(m.active7)]]],
    ['Posts', [['Total', show(m.posts)], ['Waiting for review', show(m.pending)], ['Live', show(m.approved)], ['Rejected', show(m.rejected)], ['Problems', show(m.problems)], ['Projects', show(m.projects)], ['Fundraisers', show(m.funds)]]],
    ['Help given', [['Offers of help (time or items)', show(m.helps)], ['Payments reported', show(m.donations)], ['Payments confirmed', show(m.donors)], ['Money confirmed', show(m.money, true)]]],
    ['Communities', [['Communities', show(m.communities)], ['Joins', show(m.members)], ['Organisations verified', show(m.orgsVerified)], ['Organisations waiting', show(m.orgsPending)]]],
    ['Safety', [['Reports received', show(m.reports)]]],
  ] : [];
  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.h}>Dashboard</Text>
        <Button label="Refresh" small variant="ghost" onPress={() => setTick((x) => x + 1)} />
      </View>
      {failed.length ? <Text style={styles.meta}>Could not count: {failed.join(', ')}. Publish the latest Firestore rules and check your connection.</Text> : null}
      {!m ? <Text style={styles.meta}>Loading…</Text> : null}
      {groups.map(([title, rows]) => (
        <View key={title} style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {rows.map(([l, v]) => <View key={l} style={styles.row}><Text style={styles.label}>{l}</Text><Text style={styles.val}>{v}</Text></View>)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h: { fontSize: 17, fontWeight: '800', color: colors.ink },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: space.m, marginTop: space.s, gap: 4 },
  title: { fontSize: 15, fontWeight: '800', color: colors.tealDark },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.s },
  label: { flex: 1, fontSize: 14, color: colors.slate },
  val: { fontSize: 14, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 13, color: colors.slate, marginTop: space.s },
});
