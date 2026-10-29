// First-run gate after the logo intro: three "what is this app" pages, then a demo login (name + mobile number, or guest).
// Demo only: the details are kept in this device's local storage and are never sent anywhere.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '../components/Icon';
import { Button } from '../components/ui';
import { useT } from '../i18n';
import { colors, radius, space } from '../theme';

export const USER_KEY = 'gn.user';
export type User = { name: string; phone: string; guest: boolean };

const PAGES: { icon: IconName; k: string }[] = [{ icon: 'heart', k: '1' }, { icon: 'coin', k: '2' }, { icon: 'people', k: '3' }];

export default function Welcome({ onDone }: { onDone: (u: User) => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0); // 0-2 intro pages, 3 = login
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  const finish = (u: User) => { AsyncStorage.setItem(USER_KEY, JSON.stringify(u)).catch(() => {}); onDone(u); };
  const login = () => {
    const e: typeof errors = {};
    if (name.trim().length < 2) e.name = t('n.w.nameErr');
    if (!/^\d{10}$/.test(phone.trim())) e.phone = t('n.w.phoneErr');
    setErrors(e);
    if (!e.name && !e.phone) finish({ name: name.trim(), phone: phone.trim(), guest: false });
  };

  const pad = { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl };

  if (page < 3) {
    const p = PAGES[page];
    return (
      <View style={[styles.root, pad]}>
        <View style={styles.topRow}>
          <Pressable onPress={() => setPage(3)} accessibilityRole="button" hitSlop={12}><Text style={styles.skip}>{t('n.w.skip')}</Text></Pressable>
        </View>
        <View style={styles.center}>
          <View style={styles.circle}><Icon name={p.icon} size={64} color={colors.tealDark} /></View>
          <Text accessibilityRole="header" style={styles.title}>{t(`n.w.t${p.k}`)}</Text>
          <Text style={styles.desc}>{t(`n.w.d${p.k}`)}</Text>
        </View>
        <View style={styles.dots}>{PAGES.map((_, i) => <View key={i} style={[styles.dot, i === page && styles.dotOn]} />)}</View>
        <Button label={page < 2 ? t('n.w.next') : t('n.w.start')} block onPress={() => setPage(page + 1)} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.form, pad]} keyboardShouldPersistTaps="handled">
        <View style={styles.circle}><Icon name="heart" size={48} color={colors.tealDark} /></View>
        <Text accessibilityRole="header" style={styles.title}>{t('n.w.loginT')}</Text>
        <Text style={styles.desc}>{t('n.w.loginD')}</Text>
        <Text style={styles.label}>{t('n.w.name')}</Text>
        <TextInput value={name} onChangeText={setName} autoCapitalize="words" style={[styles.input, errors.name && styles.inputErr]} accessibilityLabel={t('n.w.name')} />
        {errors.name ? <Text style={styles.err}>{errors.name}</Text> : null}
        <Text style={styles.label}>{t('n.w.phone')}</Text>
        <TextInput value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" maxLength={10} style={[styles.input, errors.phone && styles.inputErr]} accessibilityLabel={t('n.w.phone')} />
        {errors.phone ? <Text style={styles.err}>{errors.phone}</Text> : null}
        <View style={styles.actions}>
          <Button label={t('n.w.go')} block onPress={login} />
          <Button label={t('n.w.guest')} variant="ghost" block onPress={() => finish({ name: '', phone: '', guest: true })} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.white, paddingHorizontal: space.xl, zIndex: 50 },
  topRow: { alignItems: 'flex-end' },
  skip: { fontSize: 16, fontWeight: '700', color: colors.slate, padding: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.l },
  circle: { width: 128, height: 128, borderRadius: 64, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  desc: { fontSize: 17, lineHeight: 25, color: colors.slate, textAlign: 'center', maxWidth: 460 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: space.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { width: 24, backgroundColor: colors.tealDark },
  form: { flexGrow: 1, justifyContent: 'center', gap: space.m, maxWidth: 520, width: '100%', alignSelf: 'center' },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: space.s },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.m, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, color: colors.ink, backgroundColor: colors.white },
  inputErr: { borderColor: colors.brick, backgroundColor: colors.brickSoft },
  err: { fontSize: 14, color: colors.brick, fontWeight: '600' },
  actions: { gap: 12, marginTop: space.xl },
});
