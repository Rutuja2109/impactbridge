// Two-handle range bar (no extra dependency): drag either handle to set a min and max amount.
import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { colors } from '../theme';

const THUMB = 28;
const STEP = 1000;

type Props = { min: number; max: number; value: [number, number]; onChange: (v: [number, number]) => void; label: string };

export default function RangeBar({ min, max, value, onChange, label }: Props) {
  const [w, setW] = useState(0);
  const track = Math.max(1, w - THUMB);
  const live = useRef({ value, onChange, track });
  live.current = { value, onChange, track };
  const start = useRef(0);

  const toPx = (v: number) => ((v - min) / (max - min)) * track;
  const toVal = (px: number, tr: number) => Math.round((Math.min(tr, Math.max(0, px)) / tr) * (max - min) / STEP) * STEP + min;

  const pan = (which: 0 | 1) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => { start.current = ((live.current.value[which] - min) / (max - min)) * live.current.track; },
    onPanResponderMove: (_, g) => {
      const { value: v, onChange: set } = live.current;
      const next = toVal(start.current + g.dx, live.current.track);
      set(which === 0 ? [Math.min(next, v[1]), v[1]] : [v[0], Math.max(next, v[0])]);
    },
  });
  const lo = useRef(pan(0)).current;
  const hi = useRef(pan(1)).current;

  return (
    <View style={styles.wrap} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="adjustable" accessibilityLabel={label}>
      <View style={styles.rail} />
      <View style={[styles.fill, { left: THUMB / 2 + toPx(value[0]), width: toPx(value[1]) - toPx(value[0]) }]} />
      <View {...lo.panHandlers} style={[styles.thumb, { left: toPx(value[0]) }]} hitSlop={12} />
      <View {...hi.panHandlers} style={[styles.thumb, { left: toPx(value[1]) }]} hitSlop={12} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 44, justifyContent: 'center' },
  rail: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 6, borderRadius: 3, backgroundColor: colors.line },
  fill: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: colors.tealDark },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.white, borderWidth: 3, borderColor: colors.tealDark, boxShadow: '0px 2px 6px rgba(11, 42, 31, 0.25)' },
});
