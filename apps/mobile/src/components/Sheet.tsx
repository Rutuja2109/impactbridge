import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../i18n';
import { colors, radius, space, type } from '../theme';
import Icon from './Icon';

type Props = { visible: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode };

// Bottom sheet used for every panel the prototype opens (post choices, help, donate, report, organisation, updates).
// Android Back and tapping outside both close it.
export default function Sheet({ visible, onClose, title, subtitle, children }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('c.close')} />
        <View style={[styles.sheet, { paddingBottom: space.xl + insets.bottom, maxHeight: '88%' }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              {subtitle ? (typeof subtitle === 'string' ? <Text style={styles.sub}>{subtitle}</Text> : subtitle) : null}
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('c.close')} style={styles.close} hitSlop={8}>
              <Icon name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export const sheetStyles = StyleSheet.create({
  option: {
    flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.l,
    borderRadius: radius.m, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  optionPressed: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  optionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, minWidth: 0 },
  optionTitle: { ...type.cardTitle, color: colors.ink },
  optionDesc: { ...type.small, color: colors.slate, marginTop: 2 },
  note: { ...type.small, color: colors.slate },
});

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11, 42, 31, 0.45)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, paddingHorizontal: space.xl, paddingTop: space.m },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: space.m },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m, marginBottom: space.m },
  headText: { flex: 1, gap: 4 },
  title: { ...type.title, color: colors.ink },
  sub: { ...type.small, color: colors.slate },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  body: { gap: space.m, paddingBottom: space.s },
});
