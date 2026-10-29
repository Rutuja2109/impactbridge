import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BottomNav from './src/components/BottomNav';
import AppHeader from './src/components/AppHeader';
import Splash from './src/components/Splash';
import { LangProvider } from './src/i18n';
import CampaignScreen from './src/screens/CampaignScreen';
import CommunityScreen from './src/screens/CommunityScreen';
import DiscoverScreen from './src/screens/DiscoverScreen';
import HomeScreen from './src/screens/HomeScreen';
import ImpactScreen from './src/screens/ImpactScreen';
import ProjectScreen from './src/screens/ProjectScreen';
import SheetHost from './src/sheets/Sheets';
import { StoreProvider, useStore } from './src/state/store';
import { colors } from './src/theme';

// App shell: demo banner, the current tab (or the detail screen on top of it), the five-destination bottom bar
// with the centre plus, and whichever sheet is open. Everything is local sample data; nothing is sent anywhere
// and no permissions are requested.
function Shell() {
  const { tab, stack, sheet, back, closeSheet } = useStore();
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
      {intro ? <Splash onDone={() => setIntro(false)} /> : null}
      <StatusBar style={intro ? 'light' : 'dark'} />
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
