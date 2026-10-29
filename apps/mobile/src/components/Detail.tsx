// Shared pieces of the prototype's detail pages: the cover with a round Back button, and the
// sticky Share + main action bar that sits above the bottom navigation on phones.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CauseId } from '../data';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';
import { CoverArt } from './Art';
import { NAV_HEIGHT } from './BottomNav';
import Icon from './Icon';
import { Button } from './ui';

export const CTA_HEIGHT = 72;

export function DetailTop({ cause, id, placeholder }: { cause: CauseId; id: string; placeholder?: string }) {
  const { t } = useT();
  const { back } = useStore();
  return (
    <View>
      <CoverArt cause={cause} id={id} height={210} placeholder={placeholder} />
      <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t('c.back')} hitSlop={8} style={styles.back}>
        <Icon name="back" size={22} color={colors.ink} />
      </Pressable>
    </View>
  );
}

export function StickyCta({ shareLabel, onShare, label, onPress }: { shareLabel: string; onShare: () => void; label: string; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.cta, { bottom: NAV_HEIGHT + insets.bottom }]}>
      <Button label="" icon="share" variant="ghost" onPress={onShare} accessibilityLabel={shareLabel} style={styles.share} />
      <Button label={label} onPress={onPress} style={styles.main} />
    </View>
  );
}

export function NotFound({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  return (
    <View style={styles.missing}>
      <Text style={styles.missingTitle}>{t('proj.notFound')}</Text>
      <Button label={t('proj.backDisc')} small onPress={onBack} />
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export const detailStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  wrap: { paddingHorizontal: space.l, paddingTop: space.l, gap: space.m },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.ink },
  muted: { ...type.body, color: colors.slate },
  small: { ...type.small, color: colors.slate },
  body: { ...type.body, color: colors.ink },
  bullet: { flexDirection: 'row', gap: 8 },
  dot: { ...type.body, color: colors.teal, fontWeight: '800' },
});

const styles = StyleSheet.create({
  back: { position: 'absolute', left: space.l, top: space.l, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.18)' },
  cta: { position: 'absolute', left: 0, right: 0, height: CTA_HEIGHT, flexDirection: 'row', gap: space.s, alignItems: 'center', paddingHorizontal: space.l, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line },
  share: { width: 52, paddingHorizontal: 0 },
  main: { flex: 1 },
  missing: { margin: space.l, marginTop: space.xxl, alignItems: 'center', gap: space.m, padding: space.xxl, borderRadius: radius.m, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line },
  missingTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
