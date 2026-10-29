// Myntra-style filter sheet: sections down the left rail (a dot shows what is chosen), the options for the open
// section on the right, and a footer with Clear all and a live "Show N results" button.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { Button } from '../components/ui';
import RangeBar from '../components/RangeBar';
import { activeCount, areas, MONEY_MAX, moneyOn, NO_FILTERS, type Filters } from '../data/filters';
import { inr } from '../format';
import { useT } from '../i18n';
import { useDiscoverResults } from '../screens/useDiscoverResults';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';

type Section = { id: string; title: string; mode: 'radio' | 'check'; options: { id: string; label: string }[]; value: string[]; set: (v: string[]) => void };

export default function FilterSheet() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { discover, setDiscover, closeSheet } = useStore();
  const fund = discover.kind === 'fund';
  const [f, setF] = useState<Filters>(discover.f);
  const [open, setOpen] = useState('sort');
  const { count } = useDiscoverResults(f);
  const patch = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const within: Section = {
    id: 'within', title: t('n.f.time'), mode: 'radio', value: [String(f.within)], set: ([v]) => patch('within', Number(v) as Filters['within']),
    options: [['0', 'n.f.any'], ['7', 'n.f.t7'], ['14', 'n.f.t14'], ['30', 'n.f.t30']].map(([id, k]) => ({ id, label: t(k) })),
  };
  const sort: Section = {
    id: 'sort', title: t('n.f.sort'), mode: 'radio', value: [f.sort], set: ([v]) => patch('sort', v as Filters['sort']),
    options: [['relevant', 'n.f.sort.relevant'], ['urgent', 'n.f.sort.urgent'], ['nearly', 'n.f.sort.nearly'], ['most', fund ? 'n.f.sort.mostF' : 'n.f.sort.mostP']].map(([id, k]) => ({ id, label: t(k) })),
  };
  const amount: Section = { id: 'amount', title: t('n.f.amount'), mode: 'check', value: moneyOn(f) ? ['1'] : [], set: () => {}, options: [] };
  const sections: Section[] = fund
    ? [
        sort,
        amount,
        { id: 'verify', title: t('n.f.verify'), mode: 'check', value: f.verify, set: (v) => patch('verify', v as Filters['verify']), options: [['docs', 'v.docs'], ['pending', 'v.pending'], ['unverified', 'v.unverified']].map(([id, k]) => ({ id, label: t(k) })) },
        { id: 'who', title: t('n.f.who'), mode: 'check', value: f.who, set: (v) => patch('who', v as Filters['who']), options: [['individual', 'fund.individual'], ['org', 'fund.org']].map(([id, k]) => ({ id, label: t(k) })) },
        { id: 'urgent', title: t('fund.urgent'), mode: 'check', value: f.urgent ? ['1'] : [], set: (v) => patch('urgent', v.length > 0), options: [{ id: '1', label: t('n.f.urgentOnly') }] },
        within,
      ]
    : [
        sort,
        { id: 'help', title: t('n.f.help'), mode: 'check', value: f.help, set: (v) => patch('help', v as Filters['help']), options: [['money', 'n.f.h.money'], ['vols', 'n.f.h.vols'], ['items', 'n.f.h.items']].map(([id, k]) => ({ id, label: t(k) })) },
        { id: 'status', title: t('n.f.status'), mode: 'check', value: f.status, set: (v) => patch('status', v as Filters['status']), options: [['Open', 'n.f.s.open'], ['In progress', 'n.f.s.progress'], ['Completed', 'n.f.s.done']].map(([id, k]) => ({ id, label: t(k) })) },
        { id: 'area', title: t('n.f.area'), mode: 'check', value: f.area, set: (v) => patch('area', v), options: areas.map((a) => ({ id: a, label: a })) },
        within,
        { id: 'verified', title: t('n.f.verified'), mode: 'check', value: f.verified ? ['1'] : [], set: (v) => patch('verified', v.length > 0), options: [{ id: '1', label: t('n.f.verifiedOnly') }] },
      ];
  const current = sections.find((s) => s.id === open) ?? sections[0];
  const chosen = (s: Section) => (s.id === 'sort' ? s.value[0] !== 'relevant' : s.id === 'within' ? f.within !== 0 : s.value.length > 0);
  const toggle = (s: Section, id: string) => s.set(s.mode === 'radio' ? [id] : s.value.includes(id) ? s.value.filter((v) => v !== id) : [...s.value, id]);
  const bar = (key: string) => (
    <View key={key} style={styles.bar}>
      <Text style={styles.barText}>{inr(f.money[0])} – {f.money[1] >= MONEY_MAX ? t('n.f.nolimit') : inr(f.money[1])}</Text>
      <RangeBar min={0} max={MONEY_MAX} value={f.money} onChange={(v) => patch('money', v)} label={t('n.f.amount')} />
      <Text style={styles.barNote}>{t('n.f.amountNote')}</Text>
    </View>
  );
  const apply = () => { setDiscover({ f, pin: null }); closeSheet(); };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closeSheet} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={closeSheet} accessibilityLabel={t('c.close')} />
        <View style={[styles.sheet, { paddingBottom: space.l + insets.bottom }]} accessibilityViewIsModal>
          <View style={styles.head}>
            <Text accessibilityRole="header" style={styles.title}>{t('n.f.title')}{activeCount(f, fund) ? ` (${activeCount(f, fund)})` : ''}</Text>
            <Pressable onPress={closeSheet} accessibilityRole="button" accessibilityLabel={t('c.close')} style={styles.close} hitSlop={8}>
              <Icon name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>
          <View style={styles.panes}>
            <ScrollView style={styles.rail} contentContainerStyle={styles.railBody}>
              {sections.map((s) => {
                const on = s.id === current.id;
                return (
                  <Pressable key={s.id} onPress={() => setOpen(s.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.railItem, on && styles.railOn]}>
                    <Text style={[styles.railText, on && styles.railTextOn]}>{s.title}</Text>
                    {chosen(s) ? <View style={styles.dot} accessibilityLabel={t('n.earned')} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView style={styles.options} contentContainerStyle={styles.optionsBody}>
              {current.options.flatMap((o) => {
                const on = current.value.includes(o.id);
                const row = (
                  <Pressable key={o.id} onPress={() => toggle(current, o.id)} accessibilityRole={current.mode === 'radio' ? 'radio' : 'checkbox'} accessibilityState={{ checked: on }} style={styles.optionRow}>
                    <View style={[styles.box, current.mode === 'radio' && styles.round, on && styles.boxOn]}>
                      {on ? <Icon name="check" size={14} color={colors.white} strokeWidth={3} /> : null}
                    </View>
                    <Text style={styles.optionText}>{o.label}</Text>
                  </Pressable>
                );
                return current.id === 'help' && o.id === 'money' ? [row, bar('b')] : [row];
              })}
              {current.id === 'amount' ? bar('a') : null}
            </ScrollView>
          </View>
          <View style={styles.foot}>
            <Button label={t('n.f.clear')} variant="ghost" onPress={() => setF({ ...NO_FILTERS })} style={styles.footBtn} />
            <Button label={count === 0 ? t('n.f.none') : count === 1 ? t('n.f.show1') : t('n.f.show', { n: count })} onPress={apply} style={styles.footBtn} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(11, 42, 31, 0.45)' },
  sheet: { height: '78%', backgroundColor: colors.white, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, paddingTop: space.l },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingBottom: space.m },
  title: { ...type.title, color: colors.ink },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  panes: { flex: 1, flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line },
  rail: { flexGrow: 0, width: '36%', backgroundColor: colors.paper },
  railBody: { paddingVertical: space.s },
  railItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 16, paddingHorizontal: space.l, borderLeftWidth: 4, borderLeftColor: 'transparent' },
  railOn: { backgroundColor: colors.white, borderLeftColor: colors.tealDark },
  railText: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: colors.slate },
  railTextOn: { fontWeight: '800', color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.tealDark },
  options: { flex: 1 },
  optionsBody: { paddingHorizontal: space.l, paddingVertical: space.s },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  round: { borderRadius: 12 },
  boxOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  optionText: { flex: 1, fontSize: 16, color: colors.ink },
  foot: { flexDirection: 'row', gap: 12, paddingHorizontal: space.xl, paddingTop: space.m, borderTopWidth: 1, borderTopColor: colors.line },
  footBtn: { flex: 1 },
  bar: { marginLeft: 38, marginBottom: space.m, gap: 4 },
  barText: { fontSize: 15, fontWeight: '800', color: colors.tealDark },
  barNote: { fontSize: 12, lineHeight: 16, color: colors.slate },
});
