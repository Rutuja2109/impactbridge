// Keeps long lists short: show the first few rows and a "View all (N)" button that opens the rest (and "Show less" to fold it back).
// Use useCap(items, 3) at the top of a component, render cap.shown instead of the whole list, and put <ViewAll cap={cap} /> under it.
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useT } from '../i18n';
import { colors, space } from '../theme';

export type Cap<T> = { shown: T[]; total: number; hidden: number; open: boolean; toggle: () => void };

export function useCap<T>(items: T[], n = 3): Cap<T> {
  const [open, setOpen] = useState(false);
  const over = items.length > n;
  return { shown: open || !over ? items : items.slice(0, n), total: items.length, hidden: Math.max(0, items.length - n), open, toggle: () => setOpen((x) => !x) };
}

/** The button under a capped list. `en` forces English (for the staff Admin screens). Renders nothing when the list fits. */
export function ViewAll<T>({ cap, en }: { cap: Cap<T>; en?: boolean }) {
  const { t } = useT();
  if (cap.hidden === 0) return null;
  const label = cap.open ? (en ? 'Show less' : t('va.less')) : (en ? `View all (${cap.total})` : t('va.all', { n: cap.total }));
  return (
    <Pressable onPress={cap.toggle} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignSelf: 'flex-start', paddingVertical: space.s, paddingHorizontal: space.m, marginTop: 2, borderRadius: 999, backgroundColor: colors.tealSoft },
  pressed: { opacity: 0.6 },
  text: { fontSize: 14, fontWeight: '800', color: colors.tealDark },
});
