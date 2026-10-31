// "Help requests": the neighbours who offered their time or items on the person's own posts, with how to reach them. Shown near the top
// of Impact, where it is easy to find. The person can email a helper straight from here and mark them as contacted.
import { Linking, StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n';
import { markContacted, useHelpRequests } from '../state/requests';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';
import { Badge as Pill, Button } from './ui';

export default function HelpRequests() {
  const { t, formatDate } = useT();
  const { user, toast } = useStore();
  const { items, waiting } = useHelpRequests(user?.uid);
  if (!items.length) return null;
  return (
    <View style={styles.sec}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.h2}>{t('hr.title')}</Text>
        {waiting ? <View style={styles.count}><Text style={styles.countText}>{waiting}</Text></View> : null}
      </View>
      <Text style={styles.small}>{t('hr.sub')}</Text>
      {items.slice(0, 20).map((r) => (
        <View key={r.id} style={[styles.card, r.status === 'new' && styles.cardNew]}>
          <View style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>{r.name || t('hr.someone')}</Text>
            <Pill label={t(r.kind === 'volunteer' ? 'hr.vol' : 'hr.items')} tone={r.kind === 'volunteer' ? 'teal' : 'amber'} />
          </View>
          <Text style={styles.small} numberOfLines={2}>{t('hr.on', { p: r.postTitle })}</Text>
          <Text style={styles.small}>{r.email} · {formatDate(new Date(r.at || Date.now()).toISOString().slice(0, 10), { day: 'numeric', month: 'short' })}</Text>
          <View style={styles.btns}>
            {r.email ? <View style={styles.flex}><Button label={t('hr.email')} small block onPress={() => { Linking.openURL(`mailto:${r.email}?subject=${encodeURIComponent(r.postTitle)}`).catch(() => toast(t('n.cm.fail'))); }} /></View> : null}
            {r.status === 'new' ? <View style={styles.flex}><Button label={t('hr.done')} small block variant="ghost" onPress={() => { markContacted(r.postId, r.uid).catch(() => toast(t('n.cm.fail'))); }} /></View> : <Text style={styles.contacted}>{t('hr.contacted')}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sec: { paddingHorizontal: space.l, marginTop: space.xl, gap: space.s },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  h2: { ...type.title, color: colors.ink },
  count: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: colors.heart, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { fontSize: 13, fontWeight: '800', color: colors.white },
  small: { ...type.small, color: colors.slate },
  card: { gap: 4, padding: space.m, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  cardNew: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.ink },
  btns: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: space.s },
  flex: { flex: 1 },
  contacted: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.leaf },
});
