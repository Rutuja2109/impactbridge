// First-run gate after the logo intro: three "what is this app" pages, then sign-in with email + password or Google.
// New email accounts must verify their address, and "Forgot password?" emails a reset link. There is no guest option.
// With the Firebase build (google-services.json inside the app) every method is real. In Expo Go it is a local demo
// that never leaves the phone. Passwords are never stored by the app.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { checkVerified, resendVerification, resetPassword, signInEmail, signInGoogle, signOutAll, signUpEmail } from '../auth';
import Icon, { type IconName } from '../components/Icon';
import { Button } from '../components/ui';
import { firebaseReady } from '../firebase';
import { useT } from '../i18n';
import { colors, radius, space } from '../theme';

export const USER_KEY = 'gn.user';
export type User = { name: string; email: string; uid?: string; phone?: string };

const PAGES: { icon: IconName; k: string }[] = [{ icon: 'heart', k: '1' }, { icon: 'coin', k: '2' }, { icon: 'people', k: '3' }];

const GoogleG = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24">
    <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
    <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </Svg>
);

type Mode = 'signin' | 'verify' | 'forgot';

export default function Welcome({ onDone }: { onDone: (u: User) => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0); // 0-2 intro pages, 3 = sign-in
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = (u: User) => { AsyncStorage.setItem(USER_KEY, JSON.stringify(u)).catch(() => {}); onDone(u); };

  // Real mode: Firebase signs in and App.tsx hears about it through watchAuth, so there is nothing to finish here.
  const fail = (e: unknown) => {
    const raw = (e as { code?: string; message?: string });
    const c = raw?.code ?? raw?.message ?? '';
    const key = c === 'google-unavailable' ? 'n.w.gNotInApp' : c === 'google-cancelled' ? 'n.w.gCancel'
      : c.includes('too-many') ? 'n.lg.tooMany' : c.includes('email-already') ? 'n.w.exists' : c.includes('network') ? 'n.w.net'
        : c.includes('invalid-email') ? 'n.w.emailErr' : c.includes('weak-password') ? 'n.w.passErr'
          : c.startsWith('google') || c.includes('SIGN_IN') || c === '10' || c.includes('DEVELOPER_ERROR') ? 'n.w.gFail' : 'n.w.authErr';
    // The reason code is shown in small print so a failure can be reported and fixed, instead of a vague message.
    setErr(`${t(key)}${c && !c.startsWith('google-') ? `  (${c.replace('auth/', '')})` : ''}`);
    setOk('');
    setBusy(false);
  };

  const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const emailGo = (create: boolean) => {
    setErr(''); setOk('');
    const mail = email.trim();
    if (!validEmail(mail)) { setErr(t('n.w.emailErr')); return; }
    if (pass.length < 6) { setErr(t('n.w.passErr')); return; }
    if (!firebaseReady) {
      finish({ name: mail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), email: mail });
      return;
    }
    setBusy(true);
    // Signed in but not yet verified: Firebase keeps the account, the app waits on the "check your email" step.
    (create ? signUpEmail : signInEmail)(mail, pass).then((cred) => { setBusy(false); if (!cred.user.emailVerified) setMode('verify'); }).catch(fail);
  };

  const verified = () => {
    setErr(''); setBusy(true);
    checkVerified().then((u) => { setBusy(false); if (u) onDone(u); else setErr(t('n.lg.vNot')); }).catch(fail);
  };
  const resendMail = () => { setErr(''); resendVerification().then(() => setOk(t('n.lg.vSent'))).catch(fail); };
  const otherEmail = () => { signOutAll().catch(() => {}); setErr(''); setOk(''); setPass(''); setMode('signin'); };

  const sendReset = () => {
    setErr(''); setOk('');
    const mail = email.trim();
    if (!validEmail(mail)) { setErr(t('n.w.emailErr')); return; }
    if (!firebaseReady) { setOk(t('n.lg.linkSent', { e: mail })); return; }
    setBusy(true);
    // Same message whether or not the address has an account, so nobody can use this to find out who is registered.
    resetPassword(mail).then(() => { setBusy(false); setOk(t('n.lg.linkSent', { e: mail })); }).catch((e) => {
      if (String((e as { code?: string })?.code).includes('user-not-found')) { setBusy(false); setOk(t('n.lg.linkSent', { e: mail })); } else fail(e);
    });
  };

  const google = () => {
    setErr(''); setOk('');
    if (!firebaseReady) { finish({ name: t('n.guest'), email: 'google.demo@example.com' }); return; } // simulated in Expo Go
    setBusy(true);
    signInGoogle().catch(fail);
  };

  const pad = { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl };
  const policy = process.env.EXPO_PUBLIC_PRIVACY_URL;
  const openPolicy = () => { if (policy) Linking.openURL(policy).catch(() => {}); };

  if (page < 3) {
    const p = PAGES[page];
    return (
      <View style={[styles.root, pad]}>
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

  const Msg = (
    <>
      {err ? <Text style={styles.err} accessibilityLiveRegion="polite">{err}</Text> : null}
      {ok ? <Text style={styles.okMsg} accessibilityLiveRegion="polite">{ok}</Text> : null}
    </>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.form, pad]} keyboardShouldPersistTaps="handled">
        {mode !== 'signin' ? (
          <Pressable onPress={mode === 'verify' ? otherEmail : () => { setMode('signin'); setErr(''); setOk(''); }} accessibilityRole="button" accessibilityLabel={t('n.lg.back')} style={styles.back} hitSlop={10}>
            <Icon name="back" size={24} color={colors.ink} />
          </Pressable>
        ) : null}

        <Text style={styles.kicker}>{t('n.lg.welcome')}</Text>
        <Text accessibilityRole="header" style={styles.hero}>{mode === 'verify' ? t('n.lg.vT') : mode === 'forgot' ? t('n.lg.forgotT') : t('n.lg.hero')}</Text>

        {mode === 'signin' ? (
          <>
            <Text style={styles.label}>{t('n.w.email')}</Text>
            <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" style={styles.input} accessibilityLabel={t('n.w.email')} />
            <Text style={styles.label}>{t('n.w.pass')}</Text>
            <TextInput value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none" autoComplete="password" style={styles.input} accessibilityLabel={t('n.w.pass')} />
            {Msg}
            <Pressable onPress={() => { setMode('forgot'); setErr(''); setOk(''); }} accessibilityRole="button" style={styles.forgot} hitSlop={8}>
              <Text style={styles.link}>{t('n.lg.forgot')}</Text>
            </Pressable>
          </>
        ) : null}

        {mode === 'forgot' ? (
          <>
            <Text style={styles.desc2}>{t('n.lg.forgotD')}</Text>
            <Text style={styles.label}>{t('n.w.email')}</Text>
            <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" style={styles.input} accessibilityLabel={t('n.w.email')} />
            {Msg}
          </>
        ) : null}

        {mode === 'verify' ? (
          <>
            <Text style={styles.desc2}>{t('n.lg.vD', { e: email.trim() })}</Text>
            {Msg}
            <Pressable onPress={resendMail} accessibilityRole="button" style={styles.centerLink}><Text style={styles.link}>{t('n.lg.vResend')}</Text></Pressable>
            <Pressable onPress={otherEmail} accessibilityRole="button" style={styles.centerLink}><Text style={styles.link}>{t('n.lg.vOther')}</Text></Pressable>
          </>
        ) : null}

        <View style={styles.spacer} />

        {mode === 'signin' ? (
          <>
            <Text style={styles.terms}>
              {t('n.lg.terms')} <Text style={styles.termsLink} onPress={openPolicy}>{t('n.lg.tos')}</Text> {t('n.lg.and')} <Text style={styles.termsLink} onPress={openPolicy}>{t('n.lg.privacy')}</Text>
            </Text>
            <Button label={t('n.w.go')} block onPress={() => emailGo(false)} disabled={busy} />
            <Button label={t('n.w.create')} variant="ghost" block onPress={() => emailGo(true)} disabled={busy} />
            <View style={styles.orRow}><View style={styles.rule} /><Text style={styles.orText}>{t('n.lg.or')}</Text><View style={styles.rule} /></View>
            <View style={styles.social}>
              <Pressable onPress={google} disabled={busy} accessibilityRole="button" accessibilityLabel={t('n.w.google')} style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
                <GoogleG />
              </Pressable>
            </View>
          </>
        ) : null}

        {mode === 'forgot' ? <Button label={t('n.lg.sendLink')} block onPress={sendReset} disabled={busy} /> : null}
        {mode === 'verify' ? <Button label={t('n.lg.vBtn')} block onPress={verified} disabled={busy} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: '#FBFBFA', paddingHorizontal: space.xl, zIndex: 50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.l },
  circle: { width: 128, height: 128, borderRadius: 64, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  desc: { fontSize: 17, lineHeight: 25, color: colors.slate, textAlign: 'center', maxWidth: 460 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: space.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { width: 24, backgroundColor: colors.tealDark },

  form: { flexGrow: 1, gap: space.m, maxWidth: 520, width: '100%', alignSelf: 'center' },
  back: { alignSelf: 'flex-start', padding: 4 },
  kicker: { fontSize: 17, fontWeight: '700', color: colors.tealDark, marginTop: space.xl },
  hero: { fontFamily: 'serif', fontStyle: 'italic', fontWeight: '700', fontSize: 38, lineHeight: 46, color: colors.ink, marginBottom: space.m },
  label: { fontSize: 17, fontWeight: '700', color: colors.slate, marginTop: space.s },
  desc2: { fontSize: 17, lineHeight: 24, color: colors.slate },
  input: { borderWidth: 1.5, borderColor: '#C9D1CF', borderRadius: radius.m, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, color: colors.ink, backgroundColor: colors.white },
  err: { fontSize: 15, lineHeight: 21, color: colors.brick, fontWeight: '600' },
  okMsg: { fontSize: 15, lineHeight: 21, color: colors.leaf, fontWeight: '600' },
  forgot: { alignSelf: 'flex-end', paddingVertical: 4 },
  spacer: { flexGrow: 1, minHeight: space.l },
  terms: { fontSize: 14, lineHeight: 20, color: colors.slate, textAlign: 'center' },
  termsLink: { fontWeight: '800', color: colors.ink },
  centerLink: { alignSelf: 'center', paddingVertical: 8 },
  link: { fontSize: 16, fontWeight: '800', color: colors.tealDark },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: space.s },
  rule: { flex: 1, height: 1, backgroundColor: colors.line },
  orText: { fontSize: 14, fontWeight: '800', letterSpacing: 2, color: colors.ink },
  social: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: space.s },
  round: { width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, borderColor: '#C9D1CF', backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
