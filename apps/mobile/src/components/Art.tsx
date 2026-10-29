import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { causeById, type CauseId } from '../data/sample';
import { colors, radius, type } from '../theme';
import { IconShapes } from './Icon';

// Illustrated placeholders in the cause colour. They stand in for photos until real, consented images exist,
// so each one carries a visible "Placeholder image" label.

export function CoverArt({ cause, id, height }: { cause: CauseId; id: string; height: number }) {
  const c = causeById(cause);
  return (
    <View style={{ height }} accessible={false}>
      <Svg width="100%" height="100%" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`cover-${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.color} stopOpacity={0.92} />
            <Stop offset="1" stopColor={colors.tealDeep} />
          </LinearGradient>
        </Defs>
        <Rect width="320" height="160" fill={`url(#cover-${id})`} />
        <Circle cx="262" cy="38" r="70" fill="#fff" opacity={0.1} />
        <Circle cx="58" cy="152" r="60" fill="#fff" opacity={0.08} />
        <Path d="M0 132 C 80 112 160 150 320 120 V160 H0z" fill="#fff" opacity={0.14} />
        <G transform="translate(214 38) scale(3.3)" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <IconShapes name={cause} />
        </G>
      </Svg>
      <Text style={styles.placeholder}>Placeholder image</Text>
    </View>
  );
}

const PEOPLE: [number, string, string][] = [[70, '#8D5A3B', '#FFE08A'], [120, '#C68B59', '#FFFFFF'], [170, '#E0AC82', '#FF9F8E']];

export function StoryArt({ cause, id }: { cause: CauseId; id: string }) {
  const c = causeById(cause);
  return (
    <Svg width="100%" height="100%" viewBox="0 0 240 200" preserveAspectRatio="xMidYMid slice" accessible={false}>
      <Defs>
        <LinearGradient id={`story-${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={c.color} />
          <Stop offset="1" stopColor={colors.tealDeep} />
        </LinearGradient>
      </Defs>
      <Rect width="240" height="200" fill={`url(#story-${id})`} />
      <Circle cx="190" cy="40" r="60" fill="#fff" opacity={0.1} />
      <Path d="M0 150 C60 125 130 165 240 135 V200 H0z" fill="#fff" opacity={0.14} />
      <G transform="translate(92 22) scale(2.4)" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <IconShapes name={cause} />
      </G>
      {PEOPLE.map(([x, skin, top]) => (
        <G key={x} transform={`translate(${x} 140)`}>
          <Circle cy={-6} r={11} fill={skin} />
          <Path d="M-14 40V22a14 14 0 0 1 28 0v18z" fill={top} />
        </G>
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    ...type.tiny,
    color: colors.white,
    backgroundColor: 'rgba(11, 42, 31, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.s,
    overflow: 'hidden',
  },
});
