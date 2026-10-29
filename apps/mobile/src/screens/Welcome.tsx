// First-run gate after the logo intro: three "what is this app" pages, then a demo login (email + password, or a simulated Google button).
// Demo only: no account exists. Only the name and email are kept in this device's local storage; the password is never stored or sent.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '../components/Icon';
import { Button } from '../components/ui';
import { useT } from '../i18n';
import { colors, radius, space } from '../theme';

export const USER_KEY = 'gn.user';
export type User = { name: string; email: string };

const PAGES: { icon: IconName; k: string }[] = [{ icon: 'heart', k: '1' }, { icon: 'coin', k: '2' }, { icon: 'people', k: '3' }];

export default function Welcome({ onDone }: { onDone: (u: User) => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0); // 0-2 intro pages, 3 = login
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [errors, setErrors] = useState<{ email?: string; pass?: string }>({});

  const finish = (u: User) => { AsyncStorage.setItem(USER_KEY, JSON.stringify(u)).catch(() => {}); onDone(u); };
  const login = () => {
    const e: typeof errors = {};
    const mail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) e.email = t('n.w.emailErr');
    if (pass.length < 6) e.pass = t('n.w.passErr');
    setErrors(e);
    if (!e.email && !e.pass) {
      const local = mail.split('@')[0].replace(/[._-]+/g, ' ').trim();
      finish({ name: local.replace(/\b\w/g, (c) => c.toUpperCase()), email: mail });
    }
  };
  // Simulated Google sign-in: no Google account or network is involved.
  const google = () => finish({ name: t('n.guest'), email: 'google.demo@example.com' });

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
        <Button label={t('n.w.google')} variant="ghost" block onPress={google} />
        <Text style={styles.small}>{t('n.w.gNote')}</Text>
        <View style={styles.orRow}><View style={styles.rule} /><Text style={styles.small}>{t('n.w.or')}</Text><View style={styles.rule} /></View>
        <Text style={styles.label}>{t('n.w.email')}</Text>
        <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" style={[styles.input, errors.email && styles.inputErr]} accessibilityLabel={t('n.w.email')} />
        {errors.email ? <Text style={styles.err}>{errors.email}</Text> : null}
        <Text style={styles.label}>{t('n.w.pass')}</Text>
        <TextInput value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none" autoComplete="password" style={[styles.input, errors.pass && styles.inputErr]} accessibilityLabel={t('n.w.pass')} />
        {errors.pass ? <Text style={styles.err}>{errors.pass}</Text> : null}
        <View style={styles.actions}>
          <Button label={t('n.w.go')} block onPress={login} />
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
  small: { fontSize: 14, lineHeight: 20, color: colors.slate, textAlign: 'center' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: colors.line },
  err: { fontSize: 14, color: colors.brick, fontWeight: '600' },
  actions: { gap: 12, marginTop: space.xl },
});
