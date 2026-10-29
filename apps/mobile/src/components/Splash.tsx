// Launch screen, shown every time the app opens: the full GoodNeighbour logo (mark, name and tagline) fades and settles in
// on white, then the app appears by itself after a moment. There is no Skip button. With Android's "Remove animations" on,
// the finished logo simply shows for a short time instead.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';

const LOGO = require('../../assets/logo-full.png');
const RATIO = 1055 / 1107; // height / width of the artwork
const SHOW_MS = 2400;

export default function Splash({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  const settle = useRef(new Animated.Value(0)).current;
  const leave = useRef(new Animated.Value(1)).current;
  const [done, setDone] = useState(false);
  const doneRef = useRef(onDone); // the parent passes a new function every render; the timer must start only once
  doneRef.current = onDone;
  const w = Math.min(340, width * 0.82);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const leaveNow = () => Animated.timing(leave, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => { setDone(true); doneRef.current(); });
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) { fade.setValue(1); settle.setValue(1); timer = setTimeout(leaveNow, 900); return; }
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(settle, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      ]).start();
      timer = setTimeout(leaveNow, SHOW_MS);
    }).catch(() => { timer = setTimeout(leaveNow, 900); });
    return () => clearTimeout(timer);
  }, [fade, settle, leave]);

  if (done) return null;
  const scale = settle.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: leave }]} accessibilityViewIsModal>
      <Animated.Image
        source={LOGO}
        resizeMode="contain"
        accessibilityLabel="GoodNeighbour. Small acts. Real change."
        style={{ width: w, height: w * RATIO, opacity: fade, transform: [{ scale }] }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
});
