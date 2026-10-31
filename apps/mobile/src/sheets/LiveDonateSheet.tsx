// Installed-app donation to a fundraiser: one time, whenever the person likes. Pick an amount, pay the organiser's UPI ID in your own UPI
// app, then tell us you paid so the organiser can confirm it. (Giving every month lives in Monthly giving on Home, see MonthlySheet.)
// If someone closes the sheet without giving, one friendly "Before you go" screen appears (once, with a clear "Not now").
// No card or bank details are ever typed into GoodNeighbour.
import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import Icon from '../components/Icon';
import Sheet, { sheetStyles as s } from '../components/Sheet';
import { Button, Notice } from '../components/ui';
import { campaignOf } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { recordDonation, upiUrl } from '../state/donations';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme';

const ONCE = [100, 500, 1000, 2500];

export default function LiveDonateSheet({ id }: { id: string }) {
  const { t } = useT();
  const { closeSheet, user, toast } = useStore();
  const c = campaignOf(id)!;
  const [amount, setAmount] = useState(500);
  const [other, setOther] = useState(false);
  const [custom, setCustom] = useState('');
  const [ref, setRef] = useState('');
  const [opened, setOpened] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);
  const [view, setView] = useState<'form' | 'nudge'>('form');
  const [nudged, setNudged] = useState(false);

  const value = other ? Number(custom.trim()) : amount;
  const valid = Number.isInteger(value) && value >= 10 && value <= 100000;
  const medical = c.cat === 'medical';

  const requestClose = () => {
    if (done || opened || nudged || view === 'nudge') { closeSheet(); return; }
    setNudged(true);
    setView('nudge');
  };
  const pay = () => {
    if (!valid) { setErr(true); return; }
    setErr(false);
    const url = upiUrl(c.payLink ?? '', c.title, value);
    if (!url) { toast(t('lv.noUpi')); return; }
    Linking.openURL(url).then(() => setOpened(true)).catch(() => toast(t('lv.noApp')));
  };
  const paid = () => {
    if (!user?.uid) return;
    recordDonation(user, id, c.title, value, ref.trim()).then(() => setDone(true)).catch(() => toast(t('n.cm.fail')));
  };

  if (view === 'nudge') {
    return (
      <Sheet visible onClose={closeSheet} title={t('nudge.title')}>
        <View style={styles.heroWrap}><View style={styles.ringOuter}><View style={styles.ringInner}><Icon name="heart" size={44} color={colors.heart} /></View></View></View>
        <Text style={styles.nudgeBody}>{t(`nudge.o${medical ? 'Med' : ''}`, { a: inr(valid ? value : 500) })}</Text>
        <Button label={t('nudge.yes', { a: inr(valid ? value : 500) })} block onPress={() => setView('form')} />
        {valid && value > 100 ? <Button label={t('nudge.less', { a: inr(100) })} block variant="ghost" onPress={() => { setOther(false); setAmount(100); setCustom(''); setView('form'); }} /> : null}
        <Text style={styles.notNow} accessibilityRole="button" onPress={closeSheet}>{t('nudge.no')}</Text>
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={requestClose} title={t('lv.dTitle')} subtitle={<Text style={s.note}>{c.title}</Text>}>
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
            {ONCE.map((a) => (
              <Text key={a} onPress={() => { setOther(false); setAmount(a); setCustom(''); }} accessibilityRole="button" style={[styles.chip, !other && !custom.trim() && amount === a && styles.chipOn]}>{inr(a)}</Text>
            ))}
          </View>
          <TextInput style={styles.input} value={custom} onChangeText={(v) => { setCustom(v); setOther(!!v.trim()); }} keyboardType="number-pad" placeholder={t('lv.other')} placeholderTextColor={colors.slate} maxLength={6} />
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
  err: { color: colors.brick, fontSize: 14 },
  heroWrap: { alignItems: 'center', marginVertical: space.m },
  ringOuter: { width: 130, height: 130, borderRadius: 65, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFD0D5' },
  nudgeBody: { fontSize: 18, lineHeight: 26, color: colors.ink, textAlign: 'center', marginBottom: space.m },
  notNow: { textAlign: 'center', paddingVertical: space.m, fontSize: 15, fontWeight: '700', color: colors.slate },
});
