import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space, type } from '../theme';
import Icon, { type IconName } from './Icon';

export type PostAction = 'problem' | 'project' | 'fundraiser';

const ACTIONS: { id: PostAction; title: string; description: string; icon: IconName }[] = [
  { id: 'problem', title: 'Report a Problem', description: 'Tell neighbours about something that needs fixing.', icon: 'heart' },
  { id: 'project', title: 'Create a Community Project', description: 'Plan a project and ask for volunteers, skills or materials.', icon: 'people' },
  { id: 'fundraiser', title: 'Start a Fundraiser', description: 'Raise money for a person in need or an organisation’s project.', icon: 'coin' },
];

type Props = { visible: boolean; onClose: () => void; onChoose: (action: PostAction, title: string) => void };

// Bottom sheet opened by the plus button. Android Back and tapping outside both close it.
export default function PostSheet({ visible, onClose, onChoose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: space.xl + insets.bottom }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text accessibilityRole="header" style={styles.title}>What would you like to post?</Text>
              <Text style={styles.sub}>A reviewer checks every post before it goes live.</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.close} hitSlop={8}>
              <Icon name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>
          {ACTIONS.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => onChoose(a.id, a.title)}
              accessibilityRole="button"
              accessibilityLabel={`${a.title}. ${a.description}`}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            >
              <View style={styles.optionIcon}>
                <Icon name={a.icon} size={22} color={colors.tealDark} />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{a.title}</Text>
                <Text style={styles.optionDesc}>{a.description}</Text>
              </View>
              <Icon name="chev" size={18} color={colors.slate} />
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11, 42, 31, 0.45)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.l,
    borderTopRightRadius: radius.l,
    paddingHorizontal: space.xl,
    paddingTop: space.m,
    gap: space.m,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: space.s },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m, marginBottom: space.xs },
  headText: { flex: 1 },
  title: { ...type.title, color: colors.ink },
  sub: { ...type.small, color: colors.slate, marginTop: 4 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
    borderRadius: radius.m,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  optionPressed: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  optionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, minWidth: 0 },
  optionTitle: { ...type.cardTitle, color: colors.ink },
  optionDesc: { ...type.small, color: colors.slate, marginTop: 2 },
});
