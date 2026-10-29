import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_HEIGHT } from '../components/BottomNav';
import Icon, { type IconName } from '../components/Icon';
import { colors, radius, space, type } from '../theme';

// Honest stand-in for the Discover, Community and Impact tabs until those screens are built.
export default function ComingSoonScreen({ title, icon }: { title: string; icon: IconName }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: NAV_HEIGHT + insets.bottom }]}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={32} color={colors.tealDark} />
      </View>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.text}>This screen is coming in a later step. Home is ready to try now.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl },
  iconWrap: { width: 72, height: 72, borderRadius: radius.l, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.title, color: colors.ink, marginTop: space.l },
  text: { ...type.body, color: colors.slate, marginTop: space.s, textAlign: 'center' },
});
