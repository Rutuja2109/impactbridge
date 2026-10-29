import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LANGS, Rich, useT } from '../i18n';
import { colors, radius, space } from '../theme';

// The prototype's dark top banner: "everything here is sample data", plus the English / हिन्दी / मराठी switch.
export default function DemoBanner() {
  const insets = useSafeAreaInsets();
  const { tr, t, lang, setLang } = useT();
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 6 }]}>
      <Rich text={tr('banner')} style={styles.text} boldStyle={styles.bold} />
      <View style={styles.switch} accessibilityRole="radiogroup" accessibilityLabel={t('lang.label')}>
        {LANGS.map((l) => {
          const on = l.id === lang;
          return (
            <Pressable
              key={l.id}
              onPress={() => setLang(l.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={l.label}
              style={[styles.langBtn, on && styles.langOn]}
              hitSlop={4}
            >
              <Text style={[styles.langText, on && styles.langTextOn]}>{l.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.banner, paddingHorizontal: space.m, paddingBottom: 8, alignItems: 'center', gap: 6 },
  text: { color: colors.white, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  bold: { color: colors.sun },
  switch: { flexDirection: 'row', gap: 2, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: radius.pill, padding: 2 },
  langBtn: { minHeight: 30, minWidth: 52, paddingHorizontal: 10, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  langOn: { backgroundColor: colors.white },
  langText: { fontSize: 12, fontWeight: '700', color: colors.white },
  langTextOn: { color: colors.tealDeep },
});
