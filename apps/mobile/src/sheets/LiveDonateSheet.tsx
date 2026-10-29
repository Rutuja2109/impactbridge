// Installed-app donation: pick an amount, pay the organiser's UPI ID in your own UPI app, then tell us you paid so the
// organiser can confirm it. No card or bank details are ever entered in GoodNeighbour.
import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import Sheet, { sheetStyles as s } from '../components/Sheet';
import { Button, Notice } from '../components/ui';
import { campaignOf } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { recordDonation, upiUrl } from '../state/donations';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme';

const AMOUNTS = [100, 500, 1000, 2500];

export default function LiveDonateSheet({ id }: { id: string }) {
  const { t } = useT();
  const { closeSheet, user, toast } = useStore();
  const c = campaignOf(id)!;
  const [amount, setAmount] = useState(500);
  const [custom, setCustom] = useState('');
  const [ref, setRef] = useState('');
  const [opened, setOpened] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);

  const value = custom.trim() ? Number(custom.trim()) : amount;
  const valid = (!custom.trim() || /^\d+$/.test(custom.trim())) && value >= 10 && value <= 100000;
  const payTo = c.payLink ?? '';

  const pay = () => {
    if (!valid) { setErr(true); return; }
    setErr(false);
    const url = upiUrl(payTo, c.title, value);
    if (!url) { toast(t('lv.noUpi')); return; }
    Linking.openURL(url).then(() => setOpened(true)).catch(() => toast(t('lv.noApp')));
  };
  const paid = () => {
    if (!user?.uid) return;
    recordDonation(user, id, value, ref.trim()).then(() => setDone(true)).catch(() => toast(t('n.cm.fail')));
  };

  return (
    <Sheet visible onClose={closeSheet} title={t('lv.dTitle')} subtitle={<Text style={s.note}>{c.title}</Text>}>
      {done ? (
        <>
          <Notice tone="green" text={t('lv.thanks')} />
          <Button label={t('c.close')} block onPress={closeSheet} />
        </>
      ) : (
        <>
          <Notice tone="blue" text={t('lv.note')} />
          <Text style={styles.label}>{t('lv.amount')}</Text>
          <View style={styles.chips}>
            {AMOUNTS.map((a) => (
              <Text key={a} onPress={() => { setAmount(a); setCustom(''); }} accessibilityRole="button" style={[styles.chip, !custom.trim() && amount === a && styles.chipOn]}>{inr(a)}</Text>
            ))}
          </View>
          <TextInput style={styles.input} value={custom} onChangeText={setCustom} keyboardType="number-pad" placeholder={t('lv.other')} placeholderTextColor={colors.slate} maxLength={6} />
          {err ? <Text style={styles.err}>{t('lv.amtErr')}</Text> : null}
          <Button label={`${t('lv.pay')} · ${valid ? inr(value) : ''}`} block onPress={pay} />
          {opened ? (
            <>
              <Text style={styles.label}>{t('lv.after')}</Text>
              <TextInput style={styles.input} value={ref} onChangeText={setRef} keyboardType="number-pad" placeholder={t('lv.ref')} placeholderTextColor={colors.slate} maxLength={20} />
              <Button label={t('lv.paid')} block variant="ghost" onPress={paid} />
            </>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: space.m },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.s },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, color: colors.tealDark, fontWeight: '700', overflow: 'hidden' },
  chipOn: { backgroundColor: colors.tealDark, color: colors.white, borderColor: colors.tealDark },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.m, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink, marginTop: space.s, marginBottom: space.s },
  err: { color: '#B4262C', fontSize: 14 },
});
