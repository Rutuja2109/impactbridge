// Start a simulated monthly SIP for a whole cause (Ketto's "Social Impact Plan" pattern). Nothing is charged.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from '../components/Icon';
import Sheet, { sheetStyles as s } from '../components/Sheet';
import { Button, Notice } from '../components/ui';
import { catOf, categories, type CauseId } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, type } from '../theme';

export const SIP_AMOUNTS = [100, 300, 500, 1000];

export default function SipSheet({ cause: initial }: { cause?: CauseId }) {
  const { t } = useT();
  const { closeSheet, startSip, toast } = useStore();
  const [cause, setCause] = useState<CauseId>(initial ?? 'medical');
  const [amount, setAmount] = useState(300);
  const start = () => {
    startSip(cause, amount, null);
    closeSheet();
    toast(t('n.sipDone', { a: inr(amount), c: t(`cat.${cause}`) }));
  };
  return (
    <Sheet visible onClose={closeSheet} title={t('n.sipTitle')} subtitle={t('n.sipSub')}>
      <Text style={styles.label}>{t('n.sipCause')}</Text>
      <View style={styles.grid}>
        {categories.map((c) => {
          const on = c.id === cause;
          return (
            <Pressable key={c.id} onPress={() => setCause(c.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.cause, on && { borderColor: c.color, backgroundColor: c.soft }]}>
              <View style={[styles.icon, { backgroundColor: catOf(c.id).color }]}><Icon name={c.id} size={18} color={colors.white} /></View>
              <Text style={styles.causeText}>{t(`cat.${c.id}`)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={s.note}>{t('n.sipSpread')}</Text>
      <Text style={styles.label}>{t('n.sipAmount')}</Text>
      <AmountChips amounts={SIP_AMOUNTS} value={amount} onChange={setAmount} monthly />
      <Notice text={t('n.sipWhat')} />
      <Button label={t('n.sipStart')} block onPress={start} />
    </Sheet>
  );
}

export function AmountChips({ amounts, value, onChange, monthly }: { amounts: number[]; value: number | null; onChange: (a: number) => void; monthly?: boolean }) {
  const { t } = useT();
  return (
    <View style={styles.chips}>
      {amounts.map((a) => {
        const on = value === a;
        return (
          <Pressable key={a} onPress={() => onChange(a)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{monthly ? t('n.perMonth', { a: inr(a) }) : inr(a)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.cardTitle, fontSize: 15, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cause: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.m, borderWidth: 1.5, borderColor: colors.line, flexBasis: '47%', flexGrow: 1 },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  causeText: { fontSize: 14, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.slate },
  chipTextOn: { color: colors.white },
});
