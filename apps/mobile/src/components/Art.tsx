import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { catOf, type CauseId } from '../data';
import { colors, radius, type } from '../theme';
import { IconShapes } from './Icon';

// Illustrated placeholders in the cause colour, drawn like the prototype's cover() and art() functions.
// They stand in for photos, so campaign covers carry a visible "Placeholder image" label.

/** Landscape cover (320 x 160 grid); circle positions vary per item, as in the prototype. */
export function CoverArt({ cause, id, height, placeholder }: { cause: CauseId; id: string; height: number; placeholder?: string }) {
  const c = catOf(cause);
  const n = id.charCodeAt(1) * 37;
  return (
    <View style={{ height }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`cover-${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.color} stopOpacity={0.92} />
            <Stop offset="1" stopColor={colors.tealDeep} />
          </LinearGradient>
        </Defs>
        <Rect width="320" height="160" fill={`url(#cover-${id})`} />
        <Circle cx={250 + (n % 40)} cy={30 + (n % 20)} r="70" fill="#fff" opacity={0.1} />
        <Circle cx={40 + (n % 50)} cy="150" r="60" fill="#fff" opacity={0.08} />
        <Path d="M0 132 C 80 112 160 150 320 120 V160 H0z" fill="#fff" opacity={0.14} />
        <G transform="translate(212 46) scale(3.1)" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.95}>
          <IconShapes name={cause} />
        </G>
      </Svg>
      {placeholder ? <Text style={styles.placeholder}>{placeholder}</Text> : null}
    </View>
  );
}

const GROUP: [number, string, string][] = [[70, '#8D5A3B', '#FFE08A'], [120, '#C68B59', '#FFFFFF'], [170, '#E0AC82', '#FF9F8E']];

/** Portrait illustration (240 x 300 grid): category symbol, soft hills and, for stories, a small group of people. */
export function PortraitArt({ cause, id, people = false }: { cause: CauseId; id: string; people?: boolean }) {
  const c = catOf(cause);
  const n = [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return (
    <Svg width="100%" height="100%" viewBox="0 0 240 300" preserveAspectRatio="xMidYMid slice" accessible={false}>
      <Defs>
        <LinearGradient id={`p-${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={c.color} />
          <Stop offset="1" stopColor={colors.tealDeep} />
        </LinearGradient>
      </Defs>
      <Rect width="240" height="300" fill={`url(#p-${id})`} />
      <Circle cx={60 + (n % 80)} cy="70" r="90" fill="#fff" opacity={0.1} />
      <Circle cx="220" cy={120 + (n % 60)} r="70" fill="#fff" opacity={0.08} />
      <Path d="M0 210 C60 180 120 230 240 190 V300 H0z" fill="#fff" opacity={0.12} />
      <Path d="M0 250 C70 225 150 268 240 238 V300 H0z" fill="#000" opacity={0.12} />
      <G transform="translate(70 36) scale(4.2)" fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.95}>
        <IconShapes name={cause} />
      </G>
      {people ? GROUP.map(([x, skin, top]) => (
        <G key={x} transform={`translate(${x} 232)`}>
          <Circle cy={-6} r={11} fill={skin} />
          <Path d="M-14 40V22a14 14 0 0 1 28 0v18z" fill={top} />
        </G>
      )) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    position: 'absolute', right: 10, bottom: 10, ...type.tiny, color: colors.white,
    backgroundColor: 'rgba(11, 42, 31, 0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.s, overflow: 'hidden',
  },
});
