// Payments people say they made to a fundraiser. Whoever runs the fundraiser (and admins) confirm each one after seeing the
// money arrive in their own bank or UPI app; only confirmed payments count in the public total.
import { StyleSheet, Text, View } from 'react-native';

import { inr } from '../format';
import { ViewAll, useCap } from './Capped';
import { settleDonation, useDonations } from '../state/donations';
import { colors, space } from '../theme';
import { Button } from './ui';

export default function DonationsList({ postId }: { postId: string }) {
  const rows = useDonations(postId);
  const got = rows.filter((r) => r.status === 'received');
  const total = got.reduce((a, r) => a + r.amount, 0);
  const cap = useCap(rows, 3);
  if (!rows.length) return <Text style={styles.meta}>No payments reported yet.</Text>;
  return (
    <View style={styles.wrap}>
      <Text style={styles.sum}>{inr(total)} confirmed from {got.length} supporter{got.length === 1 ? '' : 's'} · {rows.length - got.length - rows.filter((r) => r.status === 'not_received').length} waiting</Text>
      {cap.shown.map((r) => (
        <View key={r.id} style={styles.row}>
          <Text style={styles.line}>{r.name || 'Supporter'} · {inr(r.amount)}{r.ref ? ` · ref ${r.ref}` : ''}</Text>
          <Text style={styles.meta}>{new Date(r.at).toLocaleString()} · {r.status === 'received' ? 'Confirmed' : r.status === 'not_received' ? 'Not received' : 'Waiting for confirmation'}</Text>
          {r.status === 'pledged' ? (
            <View style={styles.btns}>
              <View style={styles.flex}><Button label="Received" small block onPress={() => { settleDonation(postId, r, true).catch(() => {}); }} /></View>
              <View style={styles.flex}><Button label="Not received" small block variant="ghost" onPress={() => { settleDonation(postId, r, false).catch(() => {}); }} /></View>
            </View>
          ) : null}
        </View>
      ))}
      <ViewAll cap={cap} en />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s, marginTop: space.s },
  sum: { fontSize: 14, fontWeight: '700', color: colors.ink },
  row: { gap: 2, paddingTop: space.s, borderTopWidth: 1, borderTopColor: colors.line },
  line: { fontSize: 14, color: colors.ink },
  meta: { fontSize: 13, color: colors.slate },
  btns: { flexDirection: 'row', gap: space.s, marginTop: space.s },
  flex: { flex: 1 },
});
