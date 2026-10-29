import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse, G, Path, Rect } from 'react-native-svg';

import { catOf, type CauseId } from '../data';
import { useT } from '../i18n';
import { colors, radius, shadow, space } from '../theme';
import Icon from './Icon';
import { Button } from './ui';

export type MapItem = { id: string; cat: CauseId; x: number; y: number; title: string; meta: string };

// The prototype's illustrative map: a drawn neighbourhood, not a real map. Pins sit at approximate sample positions.
export default function IllustrativeMap({ items, selected, onSelect, onOpen }: { items: MapItem[]; selected: string | null; onSelect: (id: string) => void; onOpen: (id: string) => void }) {
  const { t } = useT();
  const sel = items.find((i) => i.id === selected);
  return (
    <View style={styles.map} accessibilityLabel={t('map.aria')}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="none" accessible={false}>
        <Rect width="400" height="300" fill="#EAF3EE" />
        <Path d="M0 210 C 90 190 140 250 230 220 S 360 180 400 200 V230 C 350 215 300 250 230 250 S 90 220 0 240z" fill="#BFE3F0" />
        <Ellipse cx="80" cy="215" rx="40" ry="22" fill="#BFE3F0" />
        <Rect x="250" y="40" width="70" height="50" rx="10" fill="#D3ECD9" />
        <Rect x="40" y="40" width="60" height="44" rx="10" fill="#D3ECD9" />
        <G stroke="#fff" strokeWidth={7} fill="none"><Path d="M0 120 H400" /><Path d="M170 0 V300" /><Path d="M0 40 L400 170" /><Path d="M300 0 V300" /></G>
        <G stroke="#DCE7E0" strokeWidth={2} fill="none"><Path d="M0 80 H400M0 160 H400M80 0 V300M240 0 V300M360 0 V300" /></G>
      </Svg>
      <Text style={styles.label}>{t('map.label')}</Text>
      {items.map((it) => {
        const on = it.id === selected;
        const size = on ? 42 : 34;
        return (
          <Pressable
            key={it.id}
            onPress={() => onSelect(it.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.title}
            hitSlop={6}
            style={[styles.pin, { left: `${it.x}%`, top: `${it.y + 8}%`, width: size, height: size, marginLeft: -size / 2, marginTop: -size, backgroundColor: catOf(it.cat).color }]}
          >
            <View style={styles.pinIcon}><Icon name={it.cat} size={on ? 20 : 17} color={colors.white} /></View>
          </Pressable>
        );
      })}
      <View style={styles.card}>
        {sel ? (
          <>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={2}>{sel.title}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>{sel.meta}</Text>
            </View>
            <Button label={t('map.open')} small onPress={() => onOpen(sel.id)} />
          </>
        ) : (
          <Text style={styles.cardMeta}>{t('map.tap')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { marginHorizontal: space.l, aspectRatio: 4 / 5, maxHeight: 560, borderRadius: radius.m, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: '#EAF3EE' },
  label: { position: 'absolute', left: 12, top: 12, right: 12, zIndex: 2, alignSelf: 'flex-start', backgroundColor: 'rgba(11, 42, 31, 0.86)', color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' },
  pin: { position: 'absolute', borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomRightRadius: 999, borderBottomLeftRadius: 0, transform: [{ rotate: '-45deg' }], borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.25)' },
  pinIcon: { transform: [{ rotate: '45deg' }] },
  card: { position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 3, backgroundColor: colors.white, borderRadius: radius.m, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, boxShadow: shadow.card },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.ink },
  cardMeta: { fontSize: 13, lineHeight: 18, color: colors.slate },
});
