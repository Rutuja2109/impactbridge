// The admin dashboard: how the app is being used, in one place. Tap Refresh to count again.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { inr } from '../format';
import { useMetrics } from '../state/metrics';
import { colors, radius, space } from '../theme';
import { Button } from './ui';

type Row = [string, string | number];

export default function AdminMetrics() {
  const [tick, setTick] = useState(0);
  const { m, top, failed, at } = useMetrics(tick);
  const v = (k: string, money = false): string | number => {
    const x = m?.[k];
    return x === undefined ? '—' : money ? inr(x) : x;
  };
  const waiting = m && m.donations !== undefined && m.donors !== undefined ? Math.max(0, m.donations - m.donors) : '—';
  const big: Row[] = [['People using the app', v('users')], ['Active this week', v('active7')], ['Posts shared', v('posts')], ['Offers of help', v('helps')]];
  const groups: [string, Row[]][] = [
    ['People', [['Accounts', v('users')], ['Joined today', v('usersToday')], ['Joined this week', v('users7')], ['Joined this month', v('users30')], ['Opened the app today', v('activeToday')], ['Opened it this week', v('active7')], ['Opened it this month', v('active30')]]],
    ['What people did', [['People who posted', v('posted')], ['People who offered help', v('helped')], ['People who donated', v('gave')], ['People in a community', v('inCommunity')]]],
    ['Posts', [['Total', v('posts')], ['Today', v('postsToday')], ['This week', v('posts7')], ['Waiting for review', v('pending')], ['Live', v('approved')], ['Rejected', v('rejected')], ['Problems', v('problems')], ['Community projects', v('projects')], ['Fundraisers', v('funds')], ['Sample posts', v('samples')]]],
    ['Posts by cause', [['Medical', v('cause_medical')], ['Animals', v('cause_animals')], ['Education', v('cause_education')], ['Food & hunger', v('cause_food')], ['Environment', v('cause_environment')]]],
    ['Help and money', [['Offers of help (time or items)', v('helps')], ['Payments reported by donors', v('donations')], ['Payments confirmed by organisers', v('donors')], ['Payments waiting', waiting], ['Money confirmed received', v('money', true)]]],
    ['Monthly giving (SIP)', [['Active monthly gifts', v('sipActive')], ['Monthly run-rate', v('sipRun', true)], ['Automatic charges so far', v('sipCharges')], ['Collected through SIP', v('sipCollected', true)]]],
    ['Communities', [['Communities', v('communities')], ['Joins', v('members')], ['Organisations verified', v('orgsVerified')], ['Organisations waiting', v('orgsPending')]]],
    ['Safety', [['Reports received', v('reports')]]],
  ];
  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.h}>Dashboard</Text>
        <Button label="Refresh" small variant="ghost" onPress={() => setTick((x) => x + 1)} />
      </View>
      {at ? <Text style={styles.meta}>Updated {new Date(at).toLocaleTimeString()}</Text> : <Text style={styles.meta}>Loading…</Text>}
      {failed.length ? <Text style={styles.warn}>Could not count: {failed.join(', ')}. Publish the latest Firestore rules and check your connection.</Text> : null}
      <View style={styles.bigRow}>
        {big.map(([l, x]) => <View key={l} style={styles.bigTile}><Text style={styles.bigN}>{x}</Text><Text style={styles.bigL}>{l}</Text></View>)}
      </View>
      {groups.map(([title, rows]) => (
        <View key={title} style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {rows.map(([l, x]) => <View key={l} style={styles.row}><Text style={styles.label}>{l}</Text><Text style={styles.val}>{x}</Text></View>)}
        </View>
      ))}
      {top.length ? (
        <View style={styles.card}>
          <Text style={styles.title}>Busiest communities</Text>
          {top.map((c) => <View key={c.id} style={styles.row}><Text style={styles.label} numberOfLines={1}>{c.name}</Text><Text style={styles.val}>{c.members}</Text></View>)}
        </View>
      ) : null}
      <Text style={styles.meta}>"People who ..." numbers count from when each person first does it in this version of the app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h: { fontSize: 17, fontWeight: '800', color: colors.ink },
  bigRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.s },
  bigTile: { width: '48%', flexGrow: 1, backgroundColor: colors.tealDeep, borderRadius: radius.m, padding: space.m },
  bigN: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.white },
  bigL: { fontSize: 12, color: '#BFE9E7' },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: space.m, marginTop: space.s, gap: 4 },
  title: { fontSize: 15, fontWeight: '800', color: colors.tealDark },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.s },
  label: { flex: 1, fontSize: 14, color: colors.slate },
  val: { fontSize: 14, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 13, color: colors.slate, marginTop: space.s },
  warn: { fontSize: 13, color: colors.brick, marginTop: space.s },
});
