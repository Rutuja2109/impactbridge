import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BottomNav, { type TabId } from './src/components/BottomNav';
import PostSheet from './src/components/PostSheet';
import ComingSoonScreen from './src/screens/ComingSoonScreen';
import HomeScreen from './src/screens/HomeScreen';
import { colors } from './src/theme';

// App shell: the five-destination bottom bar (Post is the centre plus button) and the screen for the chosen tab.
// Everything shown is local sample data; nothing is sent anywhere and no permissions are requested.
export default function App() {
  const [tab, setTab] = useState<TabId>('home');
  const [postOpen, setPostOpen] = useState(false);

  const choosePost = (title: string) => {
    setPostOpen(false);
    // Let the sheet finish closing before the dialog appears.
    setTimeout(() => Alert.alert(title, 'This form comes in a later step. Nothing is sent or saved.'), 250);
  };

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        {tab === 'home' && <HomeScreen onNeedSupport={() => setPostOpen(true)} onCanHelp={() => setTab('discover')} />}
        {tab === 'discover' && <ComingSoonScreen title="Discover" icon="search" />}
        {tab === 'community' && <ComingSoonScreen title="Community" icon="people" />}
        {tab === 'impact' && <ComingSoonScreen title="Impact" icon="chart" />}
        <BottomNav active={tab} onSelect={setTab} onPost={() => setPostOpen(true)} />
        <PostSheet visible={postOpen} onClose={() => setPostOpen(false)} onChoose={(_, title) => choosePost(title)} />
        <StatusBar style="dark" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
});
