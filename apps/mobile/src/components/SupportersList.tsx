// Payments the organiser has confirmed receiving, shown to everyone on a fundraiser's page (first name and amount only).
import { StyleSheet, Text, View } from 'react-native';

import { inr } from '../format';
import { useT } from '../i18n';
import { useSupporters } from '../state/donations';
import { ViewAll, useCap } from './Capped';
import { colors, space } from '../theme';

export default function SupportersList({ postId }: { postId: string }) {
  const { t } = useT();
  const rows = useSupporters(postId);
  const cap = useCap(rows, 4);
  return (
    <View style={styles.wrap}>
      <Text style={styles.sub}>{t('sp.sub')}</Text>
      {rows.length ? cap.shown.map((r) => (
        <View key={r.id} style={styles.row}>
          <Text style={styles.name}>✓ {(r.name || t('cd.anon')).split(' ')[0]}</Text>
          <Text style={styles.amt}>{inr(r.amount)}</Text>
        </View>
      )) : <Text style={styles.sub}>{t('sp.none')}</Text>}
      <ViewAll cap={cap} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  sub: { fontSize: 14, color: colors.slate },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  amt: { fontSize: 15, fontWeight: '800', color: colors.leaf },
});
