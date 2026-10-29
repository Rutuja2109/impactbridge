// Top bar: logo and name on the left; language dropdown and profile (as on Ketto) on the right; one slim demo line below.
// The language menu is a Modal positioned under its button: on Android, touches outside a parent's bounds are lost,
// so an absolutely positioned menu inside the header would not be tappable.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LANGS, useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, shadow, space } from '../theme';
import Icon from './Icon';
import { LogoMark } from './Logo';

export default function AppHeader() {
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useT();
  const { showSheet } = useStore();
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.id === lang)?.label;

  // Menu sits just under the language button: header padding, 40 high button, 6 gap; right edge = avatar (40) + gap (10) in from the screen padding.
  const menuTop = insets.top + 8 + 40 + 6;
  const menuRight = space.l + 40 + 10;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        <View style={styles.brand}>
          <LogoMark size={34} />
          <Text style={styles.name} numberOfLines={1}>GoodNeighbour</Text>
        </View>
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${t('n.lang')}: ${current}`} accessibilityState={{ expanded: open }} style={styles.lang} hitSlop={6}>
          <Text style={styles.langText}>{current}</Text>
          <View style={styles.caret}><Icon name="chev" size={16} color={colors.tealDeep} /></View>
        </Pressable>
        <Pressable onPress={() => showSheet({ kind: 'profile' })} accessibilityRole="button" accessibilityLabel={t('n.profile')} style={styles.avatar} hitSlop={6}>
          <Icon name="people" size={20} color={colors.white} />
        </Pressable>
      </View>
      <Text style={styles.demo} numberOfLines={1}>{t('n.demoLine')}</Text>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('c.close')} />
        <View style={[styles.menu, { top: menuTop, right: menuRight }]} accessibilityRole="radiogroup">
            {LANGS.map((l) => {
              const on = l.id === lang;
              return (
                <Pressable key={l.id} onPress={() => { setLang(l.id); setOpen(false); }} accessibilityRole="radio" accessibilityState={{ checked: on }} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                  <Text style={[styles.itemText, on && styles.itemOn]}>{l.label}</Text>
                  {on ? <Icon name="check" size={18} color={colors.tealDark} strokeWidth={2.6} /> : null}
                </Pressable>
              );
            })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.white, paddingHorizontal: space.l, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  name: { flexShrink: 1, fontSize: 19, fontWeight: '800', color: colors.tealDeep, letterSpacing: 0.2 },
  lang: { height: 40, paddingLeft: 14, paddingRight: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 2 },
  langText: { fontSize: 14, fontWeight: '800', color: colors.tealDeep },
  caret: { transform: [{ rotate: '90deg' }] },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#B9A9F0', alignItems: 'center', justifyContent: 'center' },
  demo: { fontSize: 11, lineHeight: 15, color: colors.slate, marginTop: 6 },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  menu: { position: 'absolute', minWidth: 170, backgroundColor: colors.white, borderRadius: radius.m, paddingVertical: 6, borderWidth: 1, borderColor: colors.line, boxShadow: shadow.raised },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, minHeight: 48 },
  pressed: { backgroundColor: colors.paper },
  itemText: { fontSize: 16, fontWeight: '600', color: colors.ink },
  itemOn: { fontWeight: '800', color: colors.tealDark },
});
