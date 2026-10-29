import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, shadow, type } from '../theme';
import Icon, { type IconName } from './Icon';

export type TabId = 'home' | 'discover' | 'community' | 'impact';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'discover', label: 'Discover', icon: 'search' },
  { id: 'community', label: 'Community', icon: 'people' },
  { id: 'impact', label: 'Impact', icon: 'chart' },
];

export const NAV_HEIGHT = 64;

type Props = { active: TabId; onSelect: (tab: TabId) => void; onPost: () => void };

// Five destinations with a raised, plus-only Post button in the centre (it has no visible text by design,
// so it carries a full spoken label instead).
export default function BottomNav({ active, onSelect, onPost }: Props) {
  const insets = useSafeAreaInsets();
  const tab = (t: (typeof TABS)[number]) => {
    const selected = t.id === active;
    return (
      <Pressable
        key={t.id}
        onPress={() => onSelect(t.id)}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={t.label}
        style={styles.item}
        hitSlop={4}
      >
        <View style={[styles.iconWrap, selected && styles.iconWrapActive]}>
          <Icon name={t.icon} size={22} color={selected ? colors.tealDark : colors.slate} />
        </View>
        <Text style={[styles.label, selected && styles.labelActive]} numberOfLines={1}>{t.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom, height: NAV_HEIGHT + insets.bottom }]} accessibilityRole="tablist">
      {tab(TABS[0])}
      {tab(TABS[1])}
      <View style={styles.item}>
        <Pressable
          onPress={onPost}
          accessibilityRole="button"
          accessibilityLabel="Post: report a problem, create a community project or start a fundraiser"
          style={({ pressed }) => [styles.plus, pressed && styles.plusPressed]}
        >
          <Icon name="plus" size={28} color={colors.white} strokeWidth={2.4} />
        </Pressable>
      </View>
      {tab(TABS[2])}
      {tab(TABS[3])}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 6,
    boxShadow: '0px -6px 20px rgba(11, 42, 31, 0.06)',
  },
  item: { flex: 1, alignItems: 'center', gap: 2, minHeight: 52, justifyContent: 'center' },
  iconWrap: { width: 46, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: colors.tealSoft },
  label: { ...type.tiny, fontSize: 11, fontWeight: '700', color: colors.slate },
  labelActive: { color: colors.tealDark },
  plus: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginTop: -30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealDark,
    borderWidth: 4,
    borderColor: colors.white,
    boxShadow: shadow.raised,
  },
  plusPressed: { backgroundColor: colors.tealDeep },
});
