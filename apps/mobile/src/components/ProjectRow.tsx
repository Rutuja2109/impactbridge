import { Pressable, StyleSheet, Text, View } from 'react-native';

import { causeById, type Project } from '../data/sample';
import { colors, radius, space, type } from '../theme';
import Icon from './Icon';

type Props = { item: Project; onPress: (item: Project) => void };

export default function ProjectRow({ item, onPress }: Props) {
  const c = causeById(item.cause);
  const inProgress = item.status === 'In progress';
  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.area}. ${item.status}. ${item.need}. Sample project.`}
      accessibilityHint="Project details are coming in a later step"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.tile, { backgroundColor: c.soft }]}>
        <Icon name={item.cause} size={24} color={c.ink} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <View style={styles.meta}>
          <Icon name="pin" size={14} color={colors.slate} />
          <Text style={styles.metaText} numberOfLines={1}>{item.area}</Text>
        </View>
        <Text style={styles.need} numberOfLines={1}>{item.need}</Text>
      </View>
      <View style={[styles.status, inProgress ? styles.statusProgress : styles.statusOpen]}>
        <Text style={[styles.statusText, { color: inProgress ? colors.amber : colors.tealDeep }]}>{item.status}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    marginHorizontal: space.l,
    paddingVertical: space.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  pressed: { opacity: 0.7 },
  tile: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 3 },
  title: { ...type.cardTitle, fontSize: 15, color: colors.ink },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...type.small, color: colors.slate, flexShrink: 1 },
  need: { ...type.small, color: colors.tealDark, fontWeight: '700' },
  status: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  statusOpen: { backgroundColor: colors.tealSoft },
  statusProgress: { backgroundColor: colors.amberSoft },
  statusText: { ...type.tiny, fontSize: 11 },
});
