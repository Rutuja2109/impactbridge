import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colors } from '../theme';

// Line icons ported from the approved prototype (24x24 grid, 2px round strokes).
type Shape =
  | { d: string }
  | { cx: number; cy: number; r: number }
  | { x: number; y: number; w: number; h: number; rx: number };

export type IconName =
  | 'home' | 'search' | 'plus' | 'people' | 'chart' | 'bell' | 'chev' | 'close' | 'pin' | 'clock'
  | 'heart' | 'coin' | 'medical' | 'animals' | 'education' | 'food' | 'environment';

const ICONS: Record<IconName, Shape[]> = {
  home: [{ d: 'M3 11 12 4l9 7' }, { d: 'M5 10v10h14V10' }, { d: 'M10 20v-6h4v6' }],
  search: [{ cx: 11, cy: 11, r: 7 }, { d: 'm20 20-3.5-3.5' }],
  plus: [{ d: 'M12 5v14M5 12h14' }],
  people: [{ cx: 9, cy: 8, r: 3.5 }, { d: 'M2.5 20a6.5 6.5 0 0 1 13 0' }, { cx: 17, cy: 9, r: 2.8 }, { d: 'M16 14.2a5 5 0 0 1 6 4.8' }],
  chart: [{ d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' }],
  bell: [{ d: 'M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z' }, { d: 'M10 21a2 2 0 0 0 4 0' }],
  chev: [{ d: 'M9 5l7 7-7 7' }],
  close: [{ d: 'M6 6l12 12M18 6 6 18' }],
  pin: [{ d: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z' }, { cx: 12, cy: 9.5, r: 2.5 }],
  clock: [{ cx: 12, cy: 12, r: 9 }, { d: 'M12 7v5l3 2' }],
  heart: [{ d: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z' }],
  coin: [{ cx: 12, cy: 12, r: 9 }, { d: 'M9 8h6M9 11.5h6M12 11.5c0 3-2 4.5-3.5 4.5L14 17' }],
  medical: [{ x: 3, y: 3, w: 18, h: 18, rx: 5 }, { d: 'M12 8v8M8 12h8' }],
  animals: [
    { cx: 6.5, cy: 10, r: 2 }, { cx: 10, cy: 5.5, r: 2 }, { cx: 14, cy: 5.5, r: 2 }, { cx: 17.5, cy: 10, r: 2 },
    { d: 'M12 12c-3 0-5.5 3.5-5.5 6 0 1.6 1.2 2.5 2.6 2.5 1.2 0 1.8-.6 2.9-.6s1.7.6 2.9.6c1.4 0 2.6-.9 2.6-2.5 0-2.5-2.5-6-5.5-6z' },
  ],
  education: [{ d: 'M3 5.5C5.5 4 9 4 12 6c3-2 6.5-2 9-.5V19c-2.5-1.5-6-1.5-9 .5-3-2-6.5-2-9-.5z' }, { d: 'M12 6v13.5' }],
  food: [{ d: 'M3 12h18a9 9 0 0 1-18 0z' }, { d: 'M8 8c0-1.5 1-2 1-3.5M12 8c0-1.5 1-2 1-3.5M16 8c0-1.5 1-2 1-3.5' }],
  environment: [{ d: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15' }, { d: 'M5 19c3-4 6-6.5 9.5-8.5' }],
};

// The raw shapes, for drawing an icon inside a larger illustration.
export function IconShapes({ name }: { name: IconName }) {
  return (
    <>
      {ICONS[name].map((s, i) =>
        'd' in s ? <Path key={i} d={s.d} />
          : 'cx' in s ? <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
            : <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} />,
      )}
    </>
  );
}

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

// Decorative by default: the control that contains an icon carries the accessible label.
export default function Icon({ name, size = 24, color = colors.ink, strokeWidth = 2 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <G fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <IconShapes name={name} />
      </G>
    </Svg>
  );
}
