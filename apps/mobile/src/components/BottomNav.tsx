import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../i18n';
import { useStore, type TabId } from '../state/store';
import { colors, shadow } from '../theme';
import Icon, { type IconName } from './Icon';

const TABS: { id: TabId; key: string; icon: IconName }[] = [
  { id: 'home', key: 'nav.home', icon: 'home' },
  { id: 'discover', key: 'nav.discover', icon: 'search' },
  { id: 'community', key: 'nav.community', icon: 'people' },
  { id: 'impact', key: 'nav.impact', icon: 'chart' },
];

export const NAV_HEIGHT = 64;

// Five destinations with the raised, plus-only Post button in the centre (no visible text by design, so it carries a
// full spoken label). Project and fundraiser pages keep Discover highlighted, as in the prototype.
export default function BottomNav() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { tab, stack, goTab, showSheet } = useStore();
  const active: TabId = stack.length ? 'discover' : tab;

  const item = (it: (typeof TABS)[number]) => {
    const selected = it.id === active;
    const label = t(it.key);
    return (
      <Pressable key={it.id} onPress={() => goTab(it.id)} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={label} style={styles.item} hitSlop={4}>
        <View style={[styles.iconWrap, selected && styles.iconWrapActive]}>
          <Icon name={it.icon} size={22} color={selected ? colors.tealDark : colors.slate} />
        </View>
        <Text style={[styles.label, selected && styles.labelActive]} numberOfLines={1}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom, height: NAV_HEIGHT + insets.bottom }]} accessibilityRole="tablist">
      {item(TABS[0])}
      {item(TABS[1])}
      <View style={styles.item}>
        <Pressable
          onPress={() => showSheet({ kind: 'post' })}
          accessibilityRole="button"
          accessibilityLabel={t('nav.postAria')}
          style={({ pressed }) => [styles.plus, pressed && styles.plusPressed]}
        >
          <Icon name="plus" size={28} color={colors.white} strokeWidth={2.4} />
        </Pressable>
      </View>
      {item(TABS[2])}
      {item(TABS[3])}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6,
    boxShadow: '0px -6px 20px rgba(11, 42, 31, 0.06)',
  },
  item: { flex: 1, alignItems: 'center', gap: 2, minHeight: 52, justifyContent: 'center', paddingHorizontal: 2 },
  iconWrap: { width: 46, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: colors.tealSoft },
  label: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.slate },
  labelActive: { color: colors.tealDark },
  plus: {
    width: 60, height: 60, borderRadius: 30, marginTop: -30, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.tealDark, borderWidth: 4, borderColor: colors.white, boxShadow: shadow.raised,
  },
  plusPressed: { backgroundColor: colors.tealDeep },
});
