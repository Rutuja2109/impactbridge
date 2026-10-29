// Launch intro, shown every time the app opens: the two arches draw in, the heart pops in on top and keeps beating,
// then the wordmark rises. Tapping the logo makes the heart jump; it continues by itself after a moment, or on Skip.
// With Android's "Remove animations" on, the finished logo shows briefly instead.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useT } from '../i18n';
import { colors, radius, space } from '../theme';
import Gradient from './Gradient';
import { BowShape, HEART_PATH } from './Logo';

const AUTO_MS = 2600;

export default function Splash({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const draw = useRef(new Animated.Value(0)).current; // arches 0 -> 1
  const pop = useRef(new Animated.Value(0)).current; // heart appears
  const beat = useRef(new Animated.Value(0)).current; // heart beating loop
  const tapJump = useRef(new Animated.Value(0)).current; // extra jump on tap
  const word = useRef(new Animated.Value(0)).current; // wordmark
  const leave = useRef(new Animated.Value(1)).current; // whole screen fade-out
  const [done, setDone] = useState(false);
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    Animated.timing(leave, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => { setDone(true); onDone(); });
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let loop: Animated.CompositeAnimation | null = null;
    let startBeat: ReturnType<typeof setTimeout> | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) {
        draw.setValue(1); pop.setValue(1); word.setValue(1);
        timer = setTimeout(finish, 900);
        return;
      }
      Animated.sequence([
        Animated.timing(draw, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: false }),
        Animated.timing(word, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
      loop = Animated.loop(Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(beat, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]));
      startBeat = setTimeout(() => loop?.start(), 900);
      timer = setTimeout(finish, AUTO_MS);
    }).catch(() => { timer = setTimeout(finish, 900); });
    return () => { clearTimeout(timer); clearTimeout(startBeat); loop?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jump = () => {
    tapJump.setValue(0);
    Animated.sequence([
      Animated.timing(tapJump, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.spring(tapJump, { toValue: 0, friction: 3, tension: 140, useNativeDriver: false }),
    ]).start();
  };

  if (done) return null;
  const bowScale = draw.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const bowTilt = draw.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] });
  const heartScale = Animated.add(
    Animated.multiply(pop, Animated.add(1, Animated.multiply(beat, 0.12))),
    Animated.multiply(tapJump, 0.35),
  );
  const heartLift = tapJump.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const wordShift = word.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: leave }]} accessibilityViewIsModal>
      <Gradient id="splash-bg" stops={[{ offset: 0, color: '#008482' }, { offset: 1, color: colors.tealDeep }]} />
      <Pressable onPress={jump} accessibilityRole="button" accessibilityLabel="GoodNeighbour" accessibilityHint={t('n.splashHint')} style={styles.mark}>
        <Animated.View style={{ opacity: draw, transform: [{ scale: bowScale }, { rotate: bowTilt }] }}>
          <Svg width={176} height={176} viewBox="0 0 80 80"><BowShape /></Svg>
        </Animated.View>
        <Animated.View style={[styles.heart, { transform: [{ translateY: heartLift }, { scale: heartScale }] }]}>
          <Svg width={176} height={176} viewBox="0 0 80 80">
            <Path d={HEART_PATH} fill={colors.heart} stroke={colors.tealDeep} strokeWidth={2.4} strokeLinejoin="round" />
          </Svg>
        </Animated.View>
      </Pressable>
      <Animated.View style={{ opacity: word, transform: [{ translateY: wordShift }], alignItems: 'center' }}>
        <Text style={styles.name}>GoodNeighbour</Text>
        <Text style={styles.tag}>{t('home.tagline')}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 100, alignItems: 'center', justifyContent: 'center', gap: space.l, backgroundColor: colors.tealDeep },
  mark: { width: 176, height: 176 },
  // The heart path sits around (40, 30) on the 80 grid, so scale it around that point.
  heart: { position: 'absolute', left: 0, top: 0, width: 176, height: 176, transformOrigin: '50% 50%' },
  name: { fontSize: 34, fontWeight: '800', color: colors.white, letterSpacing: 0.3 },
  tag: { fontSize: 16, color: 'rgba(255, 255, 255, 0.85)', marginTop: 4 },
  skip: { position: 'absolute', bottom: 48, paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.4)' },
  skipText: { color: colors.white, fontSize: 14, fontWeight: '700' },
});
