import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { causeById, type Story } from '../data/sample';
import { colors, radius, shadow, space, type } from '../theme';
import { StoryArt } from './Art';

const GAP = space.m;

// Swipeable row of fictional demo stories. Cards snap one at a time and the next card peeks in from the side.
export default function StoryCarousel({ items }: { items: Story[] }) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(300, Math.round(width * 0.78));
  const [active, setActive] = useState(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + GAP));
    if (i !== active) setActive(Math.max(0, Math.min(items.length - 1, i)));
  };

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.row}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        {items.map((s, i) => (
          <View
            key={s.id}
            style={[styles.card, { width: cardWidth }]}
            accessible
            accessibilityLabel={`Fictional demo story ${i + 1} of ${items.length}, ${causeById(s.cause).name}. ${s.quote} ${s.who}.`}
          >
            <View style={styles.art}>
              <StoryArt cause={s.cause} id={s.id} />
              <Text style={styles.tag}>Fictional demo story</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.quote}>{s.quote}</Text>
              <Text style={styles.who}>— {s.who}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots} accessible accessibilityLabel={`Story ${active + 1} of ${items.length}`}>
        {items.map((s, i) => (
          <View key={s.id} style={[styles.dot, i === active && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.l, gap: GAP, paddingBottom: space.s },
  card: {
    borderRadius: radius.l,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    boxShadow: shadow.card,
  },
  art: { height: 150 },
  tag: {
    position: 'absolute',
    left: 10,
    top: 10,
    ...type.tiny,
    color: colors.white,
    backgroundColor: 'rgba(11, 42, 31, 0.72)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.s,
    overflow: 'hidden',
  },
  body: { padding: space.l, gap: space.s },
  quote: { fontSize: 16, lineHeight: 23, fontWeight: '700', color: colors.ink },
  who: { ...type.small, color: colors.slate },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.s },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotActive: { width: 20, backgroundColor: colors.teal },
});
