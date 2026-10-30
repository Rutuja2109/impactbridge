// The admin dashboard: the main numbers about the app in one place. Tap Refresh to count again.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { inr } from '../format';
import { useMetrics } from '../state/metrics';
import { colors, radius, space } from '../theme';
import { Button } from './ui';

export default function AdminMetrics() {
  const [tick, setTick] = useState(0);
  const { m, err } = useMetrics(tick);
  const groups: [string, [string, string | number][]][] = m ? [
    ['People', [['Accounts', m.users], ['New this week', m.users7], ['Active this week', m.active7]]],
    ['Posts', [['Total', m.posts], ['Waiting for review', m.pending], ['Live', m.approved], ['Rejected', m.rejected], ['Problems', m.problems], ['Projects', m.projects], ['Fundraisers', m.funds]]],
    ['Help given', [['Offers of help (time or items)', m.helps], ['Payments reported', m.donations], ['Payments confirmed', m.donors], ['Money confirmed', inr(m.money)]]],
    ['Communities', [['Communities', m.communities], ['Joins', m.members], ['Organisations verified', m.orgsVerified], ['Organisations waiting', m.orgsPending]]],
    ['Safety', [['Reports received', m.reports]]],
  ] : [];
  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.h}>Dashboard</Text>
        <Button label="Refresh" small variant="ghost" onPress={() => setTick((x) => x + 1)} />
      </View>
      {err ? <Text style={styles.meta}>Could not load the numbers. Publish the latest Firestore rules and check your connection.</Text> : null}
      {!m && !err ? <Text style={styles.meta}>Loading…</Text> : null}
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
