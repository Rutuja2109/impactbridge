// The GoodNeighbour mark: two people forming a heart with their hands around a home, a sun above and a sprout in front.
// `size` is the width; the mark is slightly taller than wide.
import { Image } from 'react-native';

const MARK = require('../../assets/logo-mark.png');
const RATIO = 790 / 759; // height / width of the artwork

export function LogoMark({ size = 32 }: { size?: number; tile?: boolean }) {
  return <Image source={MARK} style={{ width: size, height: size * RATIO }} resizeMode="contain" accessible={false} />;
}
