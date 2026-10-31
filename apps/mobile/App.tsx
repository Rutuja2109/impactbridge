import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BottomNav from './src/components/BottomNav';
import AppHeader from './src/components/AppHeader';
import Welcome, { USER_KEY, type User } from './src/screens/Welcome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Splash from './src/components/Splash';
import { watchAuth } from './src/auth';
import { firebaseReady } from './src/firebase';
import { registerPush } from './src/push';
import { touchProfile } from './src/state/profile';
import { useLiveSync } from './src/state/posts';
import * as Notifications from 'expo-notifications';
import { LangProvider, useT } from './src/i18n';
import { useFeed } from './src/state/feed';
import { useHelpRequests, useMyTickets } from './src/state/requests';
import AdminScreen from './src/screens/AdminScreen';
import CampaignScreen from './src/screens/CampaignScreen';
import CommunityScreen from './src/screens/CommunityScreen';
import DiscoverScreen from './src/screens/DiscoverScreen';
import HomeScreen from './src/screens/HomeScreen';
import ImpactScreen from './src/screens/ImpactScreen';
import PostScreen from './src/screens/PostScreen';
import ProjectScreen from './src/screens/ProjectScreen';
import SheetHost from './src/sheets/Sheets';
import { StoreProvider, useStore } from './src/state/store';
import { colors } from './src/theme';

// App shell: demo banner, the current tab (or the detail screen on top of it), the five-destination bottom bar
// with the centre plus, and whichever sheet is open. Everything is local sample data; nothing is sent anywhere
// and no permissions are requested.
function Shell() {
  const { tab, stack, sheet, back, closeSheet, user, setUser, bumpData, toast } = useStore();
  const { t } = useT();
  useLiveSync(user?.uid, bumpData); // approved posts from Firestore (installed app only)
  const feed = useFeed(firebaseReady ? user?.uid : undefined).items;
  const newest = useRef<{ id: string; at: number } | null>(null);
  useEffect(() => {
    if (!firebaseReady || !user) return;
    const top = feed[0];
    if (!top) return;
    // The first list is the history; only items that arrive after it (and are newer) are announced.
    if (newest.current && top.id !== newest.current.id && top.at > newest.current.at) toast(t(top.kind === 'community' ? 'fd.toastC' : 'fd.toastP', { t: top.title }));
    newest.current = { id: top.id, at: top.at };
  }, [feed]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loaded, setLoaded] = useState(false); // saved demo login read from this device
  useEffect(() => {
    if (firebaseReady) return watchAuth((u) => { setUser(u); setLoaded(true); if (u?.uid) { touchProfile(u.uid, u.name, u.email); registerPush(u.uid, u.name, u.email); } });
    AsyncStorage.getItem(USER_KEY).then((v) => { if (v) setUser(JSON.parse(v) as User); }).catch(() => {}).finally(() => setLoaded(true));
  }, [setUser]);
  const { showSheet } = useStore();
  const owned = useHelpRequests(firebaseReady ? user?.uid : undefined).items;
  const offered = useMyTickets(firebaseReady ? user?.uid : undefined).items;
  const lastTk = useRef<number | null>(null);
  useEffect(() => {
    if (!firebaseReady || !user) return;
    const theirs = [...owned, ...offered].filter((x) => x.lastBy !== user.uid);
    const newest = theirs.reduce((m, x) => Math.max(m, x.lastAt), 0);
    if (lastTk.current !== null && newest > lastTk.current) {
      const x = theirs.find((y) => y.lastAt === newest);
      if (x) toast(t(x.ownerId === user.uid ? 'hr.toast' : 'tk.toast', { n: x.ownerId === user.uid ? x.name || t('hr.someone') : x.ownerName || t('ho.organiser'), k: t(x.kind === 'volunteer' ? 'hr.volShort' : 'hr.itemsShort'), p: x.postTitle }));
    }
    if (lastTk.current === null || newest > lastTk.current) lastTk.current = Math.max(newest, lastTk.current ?? 0);
  }, [owned, offered]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!firebaseReady) return undefined;
    const open = (d: Record<string, unknown> | undefined) => { if (d?.sipId) showSheet({ kind: 'monthly', id: String(d.sipPost ?? ''), sip: String(d.sipId) }); };
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data as Record<string, unknown> | undefined));
    Notifications.getLastNotificationResponseAsync().then((r) => open(r?.notification.request.content.data as Record<string, unknown> | undefined)).catch(() => undefined);
    return () => sub.remove();
  }, [showSheet]);
  const top = stack[stack.length - 1];
  const [intro, setIntro] = useState(true); // the launch intro plays on every app start

  // Android Back closes the open sheet, then detail screens, then returns to Home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet) { closeSheet(); return true; }
      return back();
    });
    return () => sub.remove();
  }, [sheet, back, closeSheet]);

  let screen;
  if (top?.name === 'project') screen = <ProjectScreen key={top.id} id={top.id} />;
  else if (top?.name === 'campaign') screen = <CampaignScreen key={top.id} id={top.id} />;
  else if (top?.name === 'post') screen = <PostScreen key={top.flow} flow={top.flow} />;
  else if (top?.name === 'admin') screen = <AdminScreen />;
  else if (tab === 'discover') screen = <DiscoverScreen />;
  else if (tab === 'community') screen = <CommunityScreen />;
  else if (tab === 'impact') screen = <ImpactScreen />;
  else screen = <HomeScreen />;

  return (
    <View style={styles.root}>
      <AppHeader />
      <View style={styles.body}>{screen}</View>
      <BottomNav />
      <SheetHost />
      {loaded && !user ? <Welcome onDone={setUser} /> : null}
      {intro ? <Splash onDone={() => setIntro(false)} /> : null}
      <StatusBar style="dark" />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LangProvider>
        <StoreProvider>
          <Shell />
        </StoreProvider>
      </LangProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  body: { flex: 1 },
});
