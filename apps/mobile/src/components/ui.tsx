// Shared building blocks styled after the prototype's badges, buttons, chips, notices and progress bars.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { catOf, causeInk, type Campaign, type CauseId, type Project } from '../data';
import { Rich, useT } from '../i18n';
import { colors, radius, shadow, space, type } from '../theme';
import Icon, { type IconName } from './Icon';

// ---------- tags and badges ----------
export function SampleTag({ label }: { label: string }) {
  return (
    <View style={styles.sample}>
      <Text style={styles.sampleText}>{label.toUpperCase()}</Text>
    </View>
  );
}

/** "English · not translated" tag for people-written sample content when the interface is in Hindi or Marathi. */
export function UntrTag() {
  const { t, untranslated } = useT();
  if (!untranslated) return null;
  return (
    <View style={[styles.sample, { backgroundColor: colors.blueSoft }]}>
      <Text style={[styles.sampleText, { color: colors.blueInk }]}>{t('c.untranslated')}</Text>
    </View>
  );
}

export function UntrNote({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t, untranslated } = useT();
  if (!untranslated) return null;
  return <Notice tone="blue" text={t('c.untranslatedNote')} style={style} />;
}

type BadgeTone = 'teal' | 'amber' | 'grey' | 'leaf' | 'violet' | 'brick';
const TONES: Record<BadgeTone, [string, string]> = {
  teal: [colors.tealSoft, colors.tealDeep],
  amber: [colors.amberSoft, colors.amber],
  grey: [colors.greySoft, colors.grey],
  leaf: [colors.leafSoft, colors.leaf],
  violet: [colors.violetSoft, colors.violet],
  brick: [colors.brickSoft, colors.brick],
};

export function Badge({ label, tone, icon }: { label: string; tone: BadgeTone; icon?: IconName }) {
  const [bg, fg] = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={12} color={fg} strokeWidth={2.6} /> : null}
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function CauseBadge({ cause }: { cause: CauseId }) {
  const { t } = useT();
  return (
    <View style={[styles.badge, { backgroundColor: catOf(cause).soft }]}>
      <Text style={[styles.badgeText, { color: causeInk(cause) }]}>{t(`cat.${cause}`)}</Text>
    </View>
  );
}

export function StatusBadge({ project }: { project: Project }) {
  const { t } = useT();
  if (project.status === 'Completed') {
    return project.verified ? <Badge label={t('st.verified')} tone="leaf" icon="check" /> : <Badge label={t('st.doneU')} tone="grey" />;
  }
  return project.status === 'Open' ? <Badge label={t('st.open')} tone="teal" /> : <Badge label={t('st.progress')} tone="amber" />;
}

export function VerifyBadge({ status }: { status: Campaign['verify'] }) {
  const { t } = useT();
  const tone: BadgeTone = status === 'docs' ? 'leaf' : status === 'pending' ? 'violet' : 'grey';
  return <Badge label={t(`v.${status}`)} tone={tone} icon={status === 'docs' ? 'check' : undefined} />;
}

// ---------- text blocks ----------
export function Notice({ text, tone = 'amber', style, rich }: { text: string; tone?: 'amber' | 'green' | 'blue' | 'red'; style?: StyleProp<ViewStyle>; rich?: boolean }) {
  const palette = { amber: [colors.amberSoft, '#7C3A06'], green: [colors.leafSoft, colors.leaf], blue: [colors.blueSoft, colors.blueInk], red: [colors.brickSoft, colors.brick] }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette[0] }, style]}>
      {rich ? <Rich text={text} style={[styles.noticeText, { color: palette[1] }]} /> : <Text style={[styles.noticeText, { color: palette[1] }]}>{text}</Text>}
    </View>
  );
}

export function PageHead({ title, subtitle, tag }: { title: string; subtitle?: string; tag?: string }) {
  return (
    <View style={styles.pageHead}>
      <Text accessibilityRole="header" style={styles.pageTitle}>{title}</Text>
      {subtitle ? <Text style={styles.pageSub}>{subtitle}</Text> : null}
      {tag ? <SampleTag label={tag} /> : null}
    </View>
  );
}

export function SectionHeader({ title, link, onLink, subtitle, tag }: { title: string; link?: string; onLink?: () => void; subtitle?: string; tag?: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
        {link && onLink ? (
          <Pressable onPress={onLink} accessibilityRole="link" hitSlop={8}>
            <Text style={styles.link}>{link}</Text>
          </Pressable>
        ) : null}
      </View>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      {tag ? <View style={{ marginTop: 6 }}><SampleTag label={tag} /></View> : null}
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function PanelTitle({ children }: { children: string }) {
  return <Text accessibilityRole="header" style={styles.panelTitle}>{children}</Text>;
}

// ---------- controls ----------
type ButtonProps = {
  label: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'on'; small?: boolean; block?: boolean;
  icon?: IconName; accessibilityLabel?: string; accessibilityHint?: string; style?: StyleProp<ViewStyle>;
};
export function Button({ label, onPress, variant = 'primary', small, block, icon, accessibilityLabel, accessibilityHint, style }: ButtonProps) {
  const fg = variant === 'primary' ? colors.white : variant === 'on' ? colors.leaf : colors.tealDark;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.btn, small && styles.btnSmall, block && styles.btnBlock, styles[variant], pressed && styles.btnPressed, style]}
    >
      {icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
      {label ? <Text style={[styles.btnText, small && styles.btnTextSmall, { color: fg }]} numberOfLines={2}>{label}</Text> : null}
    </Pressable>
  );
}

export function ChipRow({ items, selected, onSelect, label }: { items: { id: string; label: string }[]; selected: string; onSelect: (id: string) => void; label: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel={label}>
      {items.map((it) => {
        const on = it.id === selected;
        return (
          <Pressable
            key={it.id}
            onPress={() => onSelect(it.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Segmented({ items, selected, onSelect, label, stretch }: { items: { id: string; label: string }[]; selected: string; onSelect: (id: string) => void; label: string; stretch?: boolean }) {
  return (
    <View style={[styles.seg, stretch && { alignSelf: 'stretch' }]} accessibilityLabel={label} accessibilityRole="radiogroup">
      {items.map((it) => {
        const on = it.id === selected;
        return (
          <Pressable
            key={it.id}
            onPress={() => onSelect(it.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[styles.segBtn, stretch && { flex: 1 }, on && styles.segOn]}
          >
            <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- progress ----------
export function ProgressBar({ value, label, height = 8 }: { value: number; label: string; height?: number }) {
  return (
    <View style={[styles.track, { height }]} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: value }}>
      <View style={[styles.fill, { width: `${value}%` }]} />
    </View>
  );
}

/** Hatched swatch used for "promised" amounts (pledged / reported), as in the prototype legend. */
function Hatch({ id }: { id: string }) {
  return (
    <Defs>
      <Pattern id={id} patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(45)">
        <Rect width={8} height={8} fill="#CDEDEC" />
        <Line x1={0} y1={0} x2={0} y2={8} stroke="#9FD9D7" strokeWidth={8} />
      </Pattern>
    </Defs>
  );
}

/** Solid layer = received/confirmed; hatched layer = pledged but not yet received. Widths are percentages. */
export function TwoLayerBar({ solid, hatched, label, id }: { solid: number; hatched: number; label: string; id: string }) {
  return (
    <View style={[styles.track, { height: 10 }]} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <Svg width="100%" height="100%">
        <Hatch id={`h-${id}`} />
        <Rect x="0" y="0" width={`${Math.min(100, solid + hatched)}%`} height="100%" fill={`url(#h-${id})`} rx={5} />
        <Rect x="0" y="0" width={`${solid}%`} height="100%" fill={colors.teal} rx={5} />
      </Svg>
    </View>
  );
}

export function Legend({ items }: { items: { label: string; kind: 'solid' | 'hatched' | 'leaf' }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((it, i) => (
        <View key={it.label} style={styles.legendItem}>
          <View style={styles.swatch}>
            <Svg width={14} height={14}>
              {it.kind === 'hatched' ? <Hatch id={`lg-${i}`} /> : null}
              <Rect width={14} height={14} rx={4} fill={it.kind === 'hatched' ? `url(#lg-${i})` : it.kind === 'leaf' ? colors.leaf : colors.teal} />
            </Svg>
          </View>
          <Text style={styles.legendText}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function StatGrid({ items }: { items: { value: string; label: string }[] }) {
  return (
    <View style={styles.statGrid}>
      {items.map((s) => (
        <View key={s.label} style={styles.stat}>
          <Text style={styles.statValue}>{s.value}</Text>
          <Text style={styles.statLabel}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sample: { backgroundColor: colors.sampleBg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  sampleText: { ...type.tiny, color: colors.slate, letterSpacing: 0.4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '800' },
  notice: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  noticeText: { ...type.small, fontWeight: '600' },
  pageHead: { paddingHorizontal: space.l, paddingTop: space.xl, paddingBottom: space.s, gap: 6 },
  pageTitle: { fontSize: 30, lineHeight: 38, fontWeight: '800', color: colors.ink },
  pageSub: { ...type.body, color: colors.slate },
  section: { marginTop: space.xxl, marginBottom: space.m, paddingHorizontal: space.l },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.m },
  sectionTitle: { ...type.title, color: colors.ink, flexShrink: 1 },
  sectionSub: { ...type.small, color: colors.slate, marginTop: 4 },
  link: { fontSize: 14, fontWeight: '700', color: colors.tealDark },
  panel: { backgroundColor: colors.white, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, padding: space.l + 2, boxShadow: shadow.card, gap: space.s },
  panelTitle: { ...type.title, fontSize: 19, color: colors.ink, marginBottom: 2 },
  btn: { minHeight: 46, paddingHorizontal: 20, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSmall: { minHeight: 40, paddingHorizontal: 14 },
  btnBlock: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.tealDark },
  ghost: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line },
  on: { backgroundColor: colors.leafSoft },
  btnPressed: { opacity: 0.85 },
  btnText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  btnTextSmall: { fontSize: 14 },
  chips: { paddingHorizontal: space.l, gap: space.s, paddingVertical: 2 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.slate },
  chipTextOn: { color: colors.white },
  seg: { flexDirection: 'row', backgroundColor: '#EAF0EC', borderRadius: radius.pill, padding: 4, alignSelf: 'flex-start' },
  segBtn: { minHeight: 36, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.white, boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.1)' },
  segText: { fontSize: 14, fontWeight: '700', color: colors.slate },
  segTextOn: { color: colors.tealDark },
  track: { borderRadius: radius.pill, backgroundColor: '#EAF0EC', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.teal },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 4, overflow: 'hidden' },
  legendText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 6 },
  stat: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.paper, borderRadius: 12, padding: 12 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 12, lineHeight: 16, color: colors.slate, marginTop: 2 },
});
