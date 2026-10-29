// Ketto-style profile drawer, sliding in from the left: avatar and name, quick stats, then My badges, My certificates,
// My donations & SIPs (these three open the Impact page), Help, Invite, legal links and the version. Sign-up and log-in come in a later stage.
// Everything is computed from this session's demo activity; nothing is sent anywhere.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Animated, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '../components/Icon';
import { Button, Notice } from '../components/ui';
import { myVolunteering } from '../data';
import { PHOTOS } from '../data/photos';
import { inr } from '../format';
import { useT } from '../i18n';
import { badgesFor } from '../state/achievements';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_KEY } from '../screens/Welcome';
import { deleteAccount, signOutAll } from '../auth';
import { firebaseReady } from '../firebase';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';

const VERSION = '0.1.0';
type View_ = 'menu' | 'support' | 'legal';

export default function ProfileDrawer() {
  const { t } = useT();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelW = Math.min(420, Math.round(width * 0.86));
  const slide = useRef(new Animated.Value(-panelW)).current;
  const [view, setView] = useState<View_>('menu');

  useEffect(() => { Animated.timing(slide, { toValue: 0, duration: 240, useNativeDriver: true }).start(); }, [slide]);
  const close = () => Animated.timing(slide, { toValue: -panelW, duration: 200, useNativeDriver: true }).start(() => store.closeSheet());

  const activity = { myDonations: store.myDonations, sips: store.sips, joined: store.joined, going: store.going, following: store.following };
  const badges = badgesFor(activity);
  const given = store.myDonations.reduce((a, d) => a + d.a, 0);
  const hours = myVolunteering.reduce((a, v) => a + v.hours, 0);
  const back = () => setView('menu');
  const toImpact = () => { store.closeSheet(); store.goTab('impact'); };

  const privacyUrl = process.env.EXPO_PUBLIC_PRIVACY_URL;
  const adminMail = process.env.EXPO_PUBLIC_ADMIN_EMAIL;
  const adminWa = process.env.EXPO_PUBLIC_ADMIN_WHATSAPP;
  const sub: Record<string, [string, ReactNode]> = {
    support: [t('n.support'), (
      <>
        <Notice tone="blue" text={t('n.sup.d')} />
        {adminMail ? <Button label={t('n.sup.mail')} icon="share" block onPress={() => Linking.openURL(`mailto:${adminMail}?subject=GoodNeighbour%20help`).catch(() => {})} /> : null}
        {adminWa ? <Button label={t('n.sup.wa')} icon="share" variant="ghost" block onPress={() => Linking.openURL(`https://wa.me/${adminWa.replace(/\D/g, '')}`).catch(() => {})} /> : null}
        {!adminMail && !adminWa ? <Text style={styles.small}>{t('n.sup.none')}</Text> : null}
      </>
    )],
    legal: [`${t('n.terms')} · ${t('n.privacy')}`, (
      <>
        <Notice tone="blue" text={t('n.legalDemo')} />
        <Text style={styles.itemTitle}>{t('n.credits')}</Text>
        <Text style={styles.small}>{t('n.creditsNote')}</Text>
        {Object.values(PHOTOS).map((ph) => <Text key={ph.url} style={styles.small}>{ph.title} · {ph.author} · {ph.license}</Text>)}
      </>
    )],
  };

  const confirmDelete = () => Alert.alert(t('n.del.t'), t('n.del.d'), [
    { text: t('c.close'), style: 'cancel' },
    { text: t('n.del.btn'), style: 'destructive', onPress: () => deleteAccount().then(() => { store.closeSheet(); store.goTab('home'); }).catch((e: { code?: string }) => store.toast(t(e?.code === 'auth/requires-recent-login' ? 'n.del.relogin' : 'n.cm.fail'))) },
  ]);
  const menu: [IconName, string, () => void][] = [
    ['check', t('n.myBadges'), toImpact],
    ['chart', t('n.myCerts'), toImpact],
    ['bell', t('n.support'), () => setView('support')],
    ['share', t('n.refer'), () => { Share.share({ message: t('n.referText') }).catch(() => undefined); }],
  ];

  let title = '';
  let body: ReactNode;
  if (view !== 'menu') { [title, body] = sub[view]; }

  return (
    <Modal visible transparent animationType="none" onRequestClose={view === 'menu' ? close : back} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('c.close')} />
      <Animated.View style={[styles.panel, { width: panelW, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, transform: [{ translateX: slide }] }]}>
        <ScrollView contentContainerStyle={styles.content}>
          {view === 'menu' ? (
            <>
              <View style={styles.head}>
                <View style={styles.bigAvatar}><Icon name="people" size={40} color={colors.white} /></View>
                <Text style={styles.name}>{store.user?.name || t('n.guest')}</Text>
                <Text style={styles.small}>{store.user?.email || store.user?.phone || t('n.guestSub')}</Text>
              </View>
              <View style={styles.stats}>
                {[[inr(given), t('n.statGiven')], [String(hours), t('n.statHours')], [`${badges.filter((b) => b.earned).length}/${badges.length}`, t('n.statBadges')]].filter((_, i) => !firebaseReady || i === 2).map(([v, l]) => (
                  <View key={l} style={styles.stat}><Text style={styles.statV}>{v}</Text><Text style={styles.statL}>{l}</Text></View>
                ))}
              </View>
              {menu.map(([icon, label, go]) => (
                <Pressable key={label} onPress={go} accessibilityRole="button" style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
                  <Icon name={icon} size={22} color={colors.tealDark} />
                  <Text style={styles.menuText}>{label}</Text>
                  <Icon name="chev" size={18} color={colors.slate} />
                </Pressable>
              ))}
              <Button label={t('n.w.logout')} variant="ghost" block onPress={() => { AsyncStorage.removeItem(USER_KEY).catch(() => {}); signOutAll().catch(() => {}); store.closeSheet(); store.goTab('home'); store.setUser(null); }} style={styles.signUp} />
              {firebaseReady && store.user?.uid ? <Button label={t('n.del.btn')} variant="ghost" block onPress={confirmDelete} /> : null}
              <View style={styles.legal}>
                <Text style={styles.link} onPress={() => setView('legal')}>{t('n.terms')}</Text>
                <Text style={styles.link} onPress={() => (privacyUrl ? Linking.openURL(privacyUrl).catch(() => {}) : setView('legal'))}>{t('n.privacy')}</Text>
                <Text style={styles.small}>{t('n.version', { v: VERSION })}</Text>
              </View>
            </>
          ) : (
            <>
              <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t('c.back')} style={styles.backRow} hitSlop={8}>
                <Icon name="back" size={22} color={colors.ink} />
                <Text style={styles.subTitle}>{title}</Text>
              </Pressable>
              {body}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(11, 42, 31, 0.45)' },
  panel: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.white, borderTopRightRadius: 24, borderBottomRightRadius: 24 },
  content: { paddingHorizontal: space.xl, gap: space.s },
  head: { alignItems: 'center', gap: 6, paddingVertical: space.l },
  bigAvatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: '#B9A9F0', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 26, fontWeight: '800', color: colors.ink, marginTop: 6 },
  stats: { flexDirection: 'row', gap: 8, marginBottom: space.m },
  stat: { flex: 1, backgroundColor: colors.paper, borderRadius: radius.m, paddingVertical: 12, alignItems: 'center' },
  statV: { fontSize: 17, fontWeight: '800', color: colors.tealDeep },
  statL: { fontSize: 11, color: colors.slate, textAlign: 'center', marginTop: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  pressed: { opacity: 0.6 },
  menuText: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.ink },
  signUp: { marginTop: space.xl },
  login: { ...type.body, color: colors.ink, textAlign: 'center', marginTop: 4 },
  legal: { gap: 10, marginTop: space.xl, paddingTop: space.l, borderTopWidth: 1, borderTopColor: colors.line },
  link: { fontSize: 15, fontWeight: '700', color: colors.tealDark },
  small: { ...type.small, color: colors.slate },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: space.s },
  subTitle: { ...type.title, color: colors.ink, flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemTitle: { ...type.cardTitle, fontSize: 15, color: colors.ink },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.m, backgroundColor: colors.paper },
  badgeLocked: { opacity: 0.7 },
  medal: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  medalOn: { backgroundColor: colors.tealDark, borderWidth: 3, borderColor: '#F5C451' },
  medalOff: { backgroundColor: colors.greySoft },
  cert: { alignItems: 'center', gap: 8, padding: space.xl, borderRadius: radius.m, borderWidth: 2, borderColor: '#E6C77A', backgroundColor: '#FFFCF3' },
  certKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 2, color: colors.tealDeep },
  certTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  certName: { fontSize: 24, fontWeight: '800', fontStyle: 'italic', color: colors.tealDeep },
  certBody: { ...type.body, color: colors.ink, textAlign: 'center' },
  certRule: { alignSelf: 'stretch', height: 1, backgroundColor: '#E6C77A', marginVertical: 6 },
  certDemo: { fontSize: 12, fontWeight: '700', color: colors.brick, textAlign: 'center' },
});
