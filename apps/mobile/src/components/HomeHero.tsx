import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors, radius, shadow, space, type } from '../theme';
import Icon, { type IconName } from './Icon';

// The prototype's signature Home hero: a teal panel with the "neighbours on two arches" illustration,
// and two action cards that overlap its bottom edge.
// The gradient starts at #008482 (a shade darker than the prototype's #00918F) so the small white
// "Welcome, neighbour" line still meets the 4.5:1 contrast minimum.

// [x, skin, top colour] for the five neighbours, matching the prototype illustration.
const PEOPLE: [number, string, string][] = [
  [60, '#8D5A3B', '#FFE08A'],
  [110, '#C68B59', '#FFFFFF'],
  [160, '#E0AC82', '#FF9F8E'],
  [210, '#6E4429', '#BFE9E7'],
  [260, '#D9A066', '#E4D4FF'],
];

function HeroArt() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 360 120" accessible={false}>
      <Circle cx="298" cy="30" r="22" fill={colors.sun} opacity={0.95} />
      <Path d="M20 96 C 70 36 130 36 180 96" fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.5} />
      <Path d="M180 96 C 230 36 290 36 340 96" fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.5} />
      <Rect x="0" y="94" width="360" height="26" fill={colors.tealDeep} opacity={0.55} />
      {PEOPLE.map(([x, skin, top]) => (
        <G key={x} transform={`translate(${x} 62)`}>
          <Circle cy={-4} r={9} fill={skin} />
          <Path d="M-11 34V18a11 11 0 0 1 22 0v16z" fill={top} />
        </G>
      ))}
      <Path d="M166 22c0-9 10-11 14-4 4-7 14-5 14 4 0 8-14 17-14 17s-14-9-14-17z" fill={colors.heart} />
    </Svg>
  );
}

type ActionProps = { icon: IconName; title: string; description: string; tint: string; ink: string; onPress: () => void; hint: string };

function ActionCard({ icon, title, description, tint, ink, onPress, hint }: ActionProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
    >
      <View style={[styles.actionIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={26} color={ink} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionDesc}>{description}</Text>
    </Pressable>
  );
}

type Props = { onNeedSupport: () => void; onCanHelp: () => void };

export default function HomeHero({ onNeedSupport, onCanHelp }: Props) {
  return (
    <View>
      <View style={styles.panel}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" accessible={false}>
          <Defs>
            <LinearGradient id="hero-bg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#008482" />
              <Stop offset="1" stopColor={colors.tealDark} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#hero-bg)" />
        </Svg>
        <Text style={styles.eyebrow}>Welcome, neighbour 👋</Text>
        <Text style={styles.tagline} accessibilityRole="header">Small acts. Real change.</Text>
        <Text style={styles.sub}>Your community. Your people. Your impact.</Text>
        <View style={styles.art}>
          <HeroArt />
        </View>
      </View>
      <View style={styles.actions}>
        <ActionCard
          icon="heart"
          title="I need support"
          description="Tell neighbours what’s needed."
          tint="#FFF1E6"
          ink="#C2410C"
          onPress={onNeedSupport}
          hint="Opens the choices for posting a problem, project or fundraiser"
        />
        <ActionCard
          icon="hand"
          title="I can help"
          description="Give money, time or a skill."
          tint={colors.tealSoft}
          ink={colors.tealDark}
          onPress={onCanHelp}
          hint="Opens Discover"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: space.l,
    marginTop: space.l,
    paddingTop: space.xl,
    paddingHorizontal: space.xl,
    paddingBottom: 36, // room for the action cards that overlap the bottom edge
    borderRadius: radius.l,
    overflow: 'hidden',
    backgroundColor: colors.tealDark, // shown until the gradient draws
  },
  eyebrow: { ...type.small, fontWeight: '700', color: colors.white },
  tagline: { ...type.display, color: colors.white, marginTop: space.xs },
  sub: { ...type.body, color: colors.white, marginTop: space.s },
  art: { width: '100%', maxWidth: 420, aspectRatio: 3, alignSelf: 'center', marginTop: space.m },
  actions: { flexDirection: 'row', gap: space.m, marginHorizontal: space.xxl, marginTop: -28 },
  action: {
    flex: 1,
    minWidth: 0,
    padding: space.l,
    borderRadius: radius.m,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space.xs,
    boxShadow: shadow.card,
  },
  actionPressed: { borderColor: colors.teal },
  actionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  actionTitle: { ...type.cardTitle, color: colors.ink },
  actionDesc: { ...type.small, color: colors.slate },
});
