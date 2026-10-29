import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';

import { stories } from '../data';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, shadow, space, type } from '../theme';
import { PortraitArt } from './Art';
import Icon from './Icon';
import { Button } from './ui';

const GAP = 22;

// The prototype's "Stories of change" carousel: the centred card is full size, neighbours are smaller and faded,
// the quote below follows the selected story, and "Explore causes" opens that story's cause in Discover.
export default function StoryCarousel() {
  const { t } = useT();
  const { openDiscover } = useStore();
  const { width } = useWindowDimensions();
  const cardW = width >= 600 ? 260 : 224;
  const step = cardW + GAP;
  const side = Math.max(space.l, (width - cardW) / 2);
  const [active, setActive] = useState(0);
  const ref = useRef<ScrollViewInstance>(null);

  const go = (i: number) => {
    const next = Math.max(0, Math.min(stories.length - 1, i));
    setActive(next);
    ref.current?.scrollTo({ x: next * step, animated: true });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(stories.length - 1, Math.round(e.nativeEvent.contentOffset.x / step)));
    if (i !== active) setActive(i);
  };
  const s = stories[active];
  if (!s) return null;

  return (
    <View>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: side, gap: GAP, paddingVertical: 14 }}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        {stories.map((st, i) => (
          <Pressable
            key={st.id}
            onPress={() => go(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: i === active }}
            accessibilityLabel={t('story.go', { n: i + 1, c: t(`cat.${st.cat}`) })}
            style={[styles.card, { width: cardW }, i === active ? styles.active : styles.dim]}
          >
            <PortraitArt cause={st.cat} id={`s-${st.id}`} people />
            <Text style={styles.tag}>{t('story.label')}</Text>
            <Text style={styles.cat}>{t(`cat.${st.cat}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.controls}>
        <Text style={styles.count} accessibilityLiveRegion="polite">{t('story.n', { n: active + 1, t: stories.length })}</Text>
        <Pressable onPress={() => go(active - 1)} disabled={active === 0} accessibilityRole="button" accessibilityLabel={t('car.prev')} accessibilityState={{ disabled: active === 0 }} style={[styles.arrow, active === 0 && styles.arrowOff]}>
          <Icon name="back" size={22} color={colors.tealDark} />
        </Pressable>
        <Pressable onPress={() => go(active + 1)} disabled={active === stories.length - 1} accessibilityRole="button" accessibilityLabel={t('car.next')} accessibilityState={{ disabled: active === stories.length - 1 }} style={[styles.arrow, active === stories.length - 1 && styles.arrowOff]}>
          <Icon name="chev" size={22} color={colors.tealDark} />
        </Pressable>
      </View>

      <View style={styles.caption}>
        <Text style={styles.quote}>{t(`story.${s.id}.q`)}</Text>
        <Text style={styles.who}>— {t(`story.${s.id}.w`)}</Text>
      </View>
      <Button label={t('story.cta')} block onPress={() => openDiscover({ kind: 'fund', cat: s.cat })} style={styles.cta} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { aspectRatio: 4 / 5, borderRadius: radius.l, overflow: 'hidden', backgroundColor: colors.teal, boxShadow: shadow.card },
  active: { transform: [{ scale: 1 }], opacity: 1 },
  dim: { transform: [{ scale: 0.86 }], opacity: 0.6 },
  tag: { position: 'absolute', left: 10, top: 10, ...type.tiny, color: colors.white, backgroundColor: 'rgba(11, 42, 31, 0.78)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  cat: { position: 'absolute', left: 10, bottom: 10, fontSize: 12, fontWeight: '800', color: colors.tealDeep, backgroundColor: colors.white, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.l },
  count: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.slate },
  arrow: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: '#C7D8CE', backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  arrowOff: { opacity: 0.38 },
  caption: { paddingHorizontal: space.xl, paddingVertical: space.l, alignItems: 'center', gap: 6 },
  quote: { fontSize: 19, lineHeight: 27, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  who: { fontSize: 14, color: colors.slate, textAlign: 'center' },
  cta: { marginHorizontal: space.l },
});
