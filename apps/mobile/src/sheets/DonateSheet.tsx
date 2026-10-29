// The prototype's demo donation: amount -> optional fictional name and message -> review -> success.
// It never asks for card, bank or UPI details and no money moves; the campaign total changes for this session only.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import Icon from '../components/Icon';
import Sheet, { sheetStyles as s } from '../components/Sheet';
import { Button, Notice, SampleTag } from '../components/ui';
import { campaignOf, campaignReceived, fundPct } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';

const AMOUNTS = [100, 500, 1000, 2500];

export default function DonateSheet({ id }: { id: string }) {
  const { t } = useT();
  const store = useStore();
  const c = campaignOf(id)!;
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState(500);
  const [custom, setCustom] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);

  const value = custom.trim() ? Number(custom.trim()) : amount;
  const valid = (!custom.trim() || /^\d+$/.test(custom.trim())) && value >= 10 && value <= 100000;
  const shownAs = name.trim() || t('cd.anon');
  const onCampaign = store.stack[store.stack.length - 1]?.name === 'campaign' && store.stack[store.stack.length - 1]?.id === id;

  const next = () => {
    if (step === 1 && !valid) { setErr(true); return; }
    setErr(false);
    setStep(step + 1);
  };
  const confirm = () => {
    store.donate(id, value, name.trim(), msg.trim());
    setStep(4);
  };
  const ds = store.donations[id];

  return (
    <Sheet visible onClose={store.closeSheet} title={t('dn.title')} subtitle={c.title}>
      {step < 4 ? <Text style={s.note}>{t('dn.step', { n: step })}</Text> : null}

      {step === 1 ? (
        <>
          <Text style={styles.label}>{t('dn.amount')}</Text>
          <View style={styles.chips}>
            {AMOUNTS.map((a) => {
              const on = !custom.trim() && amount === a;
              return (
                <Pressable key={a} onPress={() => { setAmount(a); setCustom(''); setErr(false); }} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{inr(a)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>{t('dn.custom')}</Text>
          <TextInput
            value={custom}
            onChangeText={(v) => { setCustom(v); setErr(false); }}
            keyboardType="number-pad"
            style={[styles.input, err && styles.inputErr]}
            accessibilityLabel={t('dn.custom')}
          />
          {err ? <Text style={styles.err} accessibilityLiveRegion="polite">{t('e.amount')}</Text> : null}
          <Button label={t('b.next')} onPress={next} block />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Text style={styles.label}>{t('dn.name')} <Text style={styles.opt}>{t('opt')}</Text></Text>
          <Text style={s.note}>{t('dn.nameHint')}</Text>
          <TextInput value={name} onChangeText={setName} maxLength={40} style={styles.input} accessibilityLabel={t('dn.name')} />
          <Text style={styles.label}>{t('dn.msg')} <Text style={styles.opt}>{t('opt')}</Text></Text>
          <TextInput value={msg} onChangeText={setMsg} maxLength={140} multiline style={[styles.input, styles.multi]} accessibilityLabel={t('dn.msg')} />
          <View style={styles.nav}>
            <Button label={t('b.back')} variant="ghost" onPress={() => setStep(1)} style={styles.flex} />
            <Button label={t('b.next')} onPress={next} style={styles.flex} />
          </View>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Text style={styles.h3}>{t('dn.review')}</Text>
          <View style={styles.dl}>
            <Text style={styles.dt}>{t('dn.to')}</Text><Text style={styles.dd}>{c.title}</Text>
            <Text style={styles.dt}>{t('dn.amt')}</Text>
            <View style={styles.amountRow}><Text style={styles.big}>{inr(value)}</Text><SampleTag label={t('dn.simTag')} /></View>
            <Text style={styles.dt}>{t('dn.as')}</Text><Text style={styles.dd}>{shownAs}</Text>
            {msg.trim() ? <><Text style={styles.dt}>{t('dn.msg')}</Text><Text style={styles.dd}>{msg.trim()}</Text></> : null}
          </View>
          <Notice text={t('dn.noPay')} />
          <View style={styles.nav}>
            <Button label={t('b.back')} variant="ghost" onPress={() => setStep(2)} style={styles.flex} />
            <Button label={t('dn.confirm')} onPress={confirm} style={styles.flex} />
          </View>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <View style={styles.success}><Icon name="check" size={34} color={colors.leaf} strokeWidth={2.6} /></View>
          <Text style={styles.h3}>{t('dn.successT')}</Text>
          <Notice tone="green" text={t('dn.success')} />
          <Text style={styles.body}>{t('dn.updated', { a: inr(campaignReceived(c, ds)), p: fundPct(c, ds) })}</Text>
          <Text style={s.note}>{t('dn.noReceipt')}</Text>
          <View style={styles.nav}>
            {onCampaign ? (
              <Button label={t('b.backCampaign')} onPress={store.closeSheet} style={styles.flex} />
            ) : (
              <Button label={t('fund.view')} onPress={() => store.open({ name: 'campaign', id })} style={styles.flex} />
            )}
            <Button label={t('b.seeImpact')} variant="ghost" onPress={() => store.goTab('impact')} style={styles.flex} />
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { ...type.cardTitle, fontSize: 15, color: colors.ink },
  opt: { fontSize: 12, fontWeight: '800', color: colors.slate },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.slate },
  chipTextOn: { color: colors.white },
  input: { minHeight: 48, borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  inputErr: { borderColor: colors.brick },
  multi: { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 },
  err: { fontSize: 13, fontWeight: '700', color: colors.brick },
  nav: { flexDirection: 'row', gap: 10, marginTop: space.s },
  flex: { flex: 1 },
  h3: { ...type.title, fontSize: 18, color: colors.ink },
  dl: { gap: 2 },
  dt: { fontSize: 12, fontWeight: '800', color: colors.slate, marginTop: 8 },
  dd: { ...type.body, color: colors.ink },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  big: { fontSize: 20, fontWeight: '800', color: colors.ink },
  success: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.leafSoft, alignItems: 'center', justifyContent: 'center' },
  body: { ...type.body, color: colors.ink },
});
