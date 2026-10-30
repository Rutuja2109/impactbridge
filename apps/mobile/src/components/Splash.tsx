// Launch screen, shown every time the app opens: the full GoodNeighbour logo fades in on white and beats gently like a
// heart. Tap anywhere and little hearts float up from your finger (each tap also keeps the screen a little longer), then the
// app opens by itself. There is no Skip button. With Android's "Remove animations" on, the finished logo simply shows briefly.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';

const LOGO = require('../../assets/logo-full.png');
const RATIO = 1055 / 1107; // height / width of the artwork
const SHOW_MS = 2600;
const EXTRA_MS = 900; // added by each tap
const MAX_MS = 6000;

type Heart = { id: number; x: number; y: number; rise: Animated.Value };

export default function Splash({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  const settle = useRef(new Animated.Value(0)).current;
  const beat = useRef(new Animated.Value(0)).current;
  const leave = useRef(new Animated.Value(1)).current;
  const [done, setDone] = useState(false);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const doneRef = useRef(onDone); // the parent passes a new function every render; the timer must start only once
  doneRef.current = onDone;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const started = useRef(0);
  const reduce = useRef(false);
  const idRef = useRef(0);
  const taps = useRef(0);
  const w = Math.min(340, width * 0.82);

  const leaveNow = () => Animated.timing(leave, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => { setDone(true); doneRef.current(); });
  const schedule = (ms: number) => { clearTimeout(timer.current); timer.current = setTimeout(leaveNow, ms); };

  useEffect(() => {
    started.current = Date.now();
    AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      reduce.current = r;
      if (r) { fade.setValue(1); settle.setValue(1); schedule(900); return; }
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(settle, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      ]).start();
      Animated.loop(Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(260),
      ])).start();
      schedule(SHOW_MS);
    }).catch(() => schedule(900));
    return () => clearTimeout(timer.current);
  }, [fade, settle, beat, leave]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (x: number, y: number) => {
    if (reduce.current) return;
    const rise = new Animated.Value(0);
    const id = idRef.current++;
    setHearts((h) => [...h.slice(-12), { id, x, y, rise }]);
    Animated.timing(rise, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => setHearts((h) => h.filter((q) => q.id !== id)));
    Animated.sequence([
      Animated.timing(beat, { toValue: 1.6, duration: 120, useNativeDriver: true }),
      Animated.timing(beat, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
    taps.current += 1;
    const total = Math.min(MAX_MS, SHOW_MS + EXTRA_MS * taps.current);
    schedule(Math.max(700, total - (Date.now() - started.current)));
  };

  if (done) return null;
  const scale = Animated.multiply(settle.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }), beat.interpolate({ inputRange: [0, 1, 1.6], outputRange: [1, 1.04, 1.08] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: leave }]} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={(e) => tap(e.nativeEvent.pageX, e.nativeEvent.pageY)} accessibilityLabel="GoodNeighbour. Small acts. Real change." accessibilityHint="Tap for hearts" />
      <Animated.Image
        source={LOGO}
        resizeMode="contain"
        pointerEvents="none"
        accessibilityLabel="GoodNeighbour. Small acts. Real change."
        style={{ width: w, height: w * RATIO, opacity: fade, transform: [{ scale }] }}
      />
      {hearts.map((h) => (
        <Animated.View
          key={h.id}
          pointerEvents="none"
          style={[styles.heart, { left: h.x - 14, top: h.y - 14, opacity: h.rise.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.9, 0] }), transform: [
            { translateY: h.rise.interpolate({ inputRange: [0, 1], outputRange: [0, -160] }) },
            { translateX: h.rise.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, (h.id % 2 ? 18 : -18), 0] }) },
            { scale: h.rise.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.1, 0.8] }) },
          ] }]}
        >
          <Text style={styles.heartText}>{['❤️', '💚', '🧡', '💛'][h.id % 4]}</Text>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  heart: { position: 'absolute' },
  heartText: { fontSize: 28 },
});
