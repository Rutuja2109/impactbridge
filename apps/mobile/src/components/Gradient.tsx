// A linear-gradient background that fills its parent. It measures the box and draws the SVG at exact pixel size:
// on Android a percentage-sized, absolutely positioned <Svg> can stop short of the box edges (seen on a real device).
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type StopDef = { offset: number; color: string; opacity?: number };

export default function Gradient({ id, stops, x2 = 1, y2 = 1, children }: { id: string; stops: StopDef[]; x2?: number; y2?: number; children?: (w: number, h: number) => ReactNode }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={String(x2)} y2={String(y2)}>
              {stops.map((s) => <Stop key={s.offset} offset={String(s.offset)} stopColor={s.color} stopOpacity={s.opacity ?? 1} />)}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${id})`} />
          {children?.(size.w, size.h)}
        </Svg>
      ) : null}
    </View>
  );
}

/** Fills the parent with any child (e.g. an illustration) at measured pixel size. */
export function Fill({ children }: { children: (w: number, h: number) => ReactNode }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size.w > 0 ? children(size.w, size.h) : null}
    </View>
  );
}
