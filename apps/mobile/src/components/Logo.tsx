// The GoodNeighbour mark: a gift-ribbon bow (giving) tied with a heart (care), on a teal tile. 80 x 80 grid.
import Svg, { Path, Rect } from 'react-native-svg';

import { colors } from '../theme';

export const HEART_PATH = 'M40 50 C 23 38 28 25 35 27 C 38 28 40 31 40 33 C 40 31 42 28 45 27 C 52 25 57 38 40 50z';
const LOOP_L = 'M39 40 C 25 22 8 26 11 41 C 14 54 31 51 39 40z';
const LOOP_R = 'M41 40 C 55 22 72 26 69 41 C 66 54 49 51 41 40z';
const TAIL_L = 'M37 46 L27 70 L35 64 L41 50z';
const TAIL_R = 'M43 46 L53 70 L45 64 L39 50z';

/** The bow without the heart: two loops and two tails. Splash animates it separately from the heart. */
export function BowShape({ color = '#fff' }: { color?: string }) {
  return (
    <>
      <Path d={TAIL_L} fill={color} opacity={0.85} />
      <Path d={TAIL_R} fill={color} opacity={0.85} />
      <Path d={LOOP_L} fill={color} />
      <Path d={LOOP_R} fill={color} />
    </>
  );
}

export function LogoMark({ size = 32, tile = true }: { size?: number; tile?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" accessible={false}>
      {tile ? <Rect width="80" height="80" rx="22" fill={colors.tealDark} /> : null}
      <BowShape />
      <Path d={HEART_PATH} fill={colors.heart} stroke={colors.tealDark} strokeWidth={2.4} strokeLinejoin="round" />
    </Svg>
  );
}
