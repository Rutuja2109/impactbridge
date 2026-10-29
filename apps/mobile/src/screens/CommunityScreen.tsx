import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_HEIGHT } from '../components/BottomNav';
import Icon from '../components/Icon';
import { Button, PageHead } from '../components/ui';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, shadow, space, type } from '../theme';

const ID = 'community'; // the one community for now; joining it earns the "Community member" badge
const MEMBERS = 1240; // sample figure

// Community for now: one "Join community" card with the member count and the joined state.
// Fundraisers, volunteer opportunities and events come back in a later stage. Joining is session-only demo state.
export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { following, toggle, toast } = useStore();
  const on = following.includes(ID);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: NAV_HEIGHT + insets.bottom + space.xxl }}>
      <PageHead title={t('comm.title')} subtitle={t('comm.sub')} tag={t('c.sampleData')} />
      <View style={styles.card}>
        <View style={styles.icon}><Icon name="people" size={36} color={colors.tealDark} /></View>
        <Text style={styles.title}>{t('n.cName')}</Text>
        <Text style={styles.desc}>{t('n.cDesc')}</Text>
        <Text style={styles.members}>{t('n.cMembers', { n: (MEMBERS + (on ? 1 : 0)).toLocaleString('en-IN') })}</Text>
        <Button
          label={on ? t('n.cJoined') : t('n.cJoin')}
          variant={on ? 'on' : 'primary'}
          block
          icon={on ? 'check' : undefined}
          onPress={() => toast(t(toggle('following', ID) ? 'n.cToastJoin' : 'n.cToastLeave'))}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  card: { marginHorizontal: space.l, marginTop: space.xl, padding: space.xl, gap: space.m, alignItems: 'center', borderRadius: radius.l, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, boxShadow: shadow.card },
  icon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.title, color: colors.ink, textAlign: 'center' },
  desc: { ...type.body, color: colors.slate, textAlign: 'center' },
  members: { fontSize: 16, fontWeight: '800', color: colors.tealDark },
});
