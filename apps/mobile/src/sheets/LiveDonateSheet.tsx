// Installed-app donation. Pick Once or Every month, then an amount.
//  Once: pay the organiser's UPI ID in your own UPI app, then tell us you paid so the organiser can confirm it.
//  Every month (SIP): approve a UPI AutoPay mandate once through Razorpay's checkout; the money is then charged every month
//  automatically, and the donor can stop it any time from Impact. No card or bank details are ever typed into GoodNeighbour.
import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import Sheet, { sheetStyles as s } from '../components/Sheet';
import SipCheckout from '../components/SipCheckout';
import { Button, Notice, Segmented } from '../components/ui';
import { campaignOf } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { recordDonation, upiUrl } from '../state/donations';
import { SIP_MAX, SIP_MIN, startSip, useSipConfig } from '../state/sip';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme';

const AMOUNTS = [100, 500, 1000, 2500];

export default function LiveDonateSheet({ id }: { id: string }) {
  const { t } = useT();
  const { closeSheet, user, toast } = useStore();
  const cfg = useSipConfig();
  const c = campaignOf(id)!;
  const [mode, setMode] = useState<'once' | 'month'>('once');
  const [amount, setAmount] = useState(500);
  const [custom, setCustom] = useState('');
  const [ref, setRef] = useState('');
  const [opened, setOpened] = useState(false);
  const [done, setDone] = useState<'' | 'once' | 'month'>('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState<{ keyId: string; subscriptionId: string } | null>(null);

  const monthly = mode === 'month';
  const lo = monthly ? SIP_MIN : 10;
  const hi = monthly ? SIP_MAX : 100000;
  const value = custom.trim() ? Number(custom.trim()) : amount;
  const valid = (!custom.trim() || /^\d+$/.test(custom.trim())) && value >= lo && value <= hi;
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
    recordDonation(user, id, c.title, value, ref.trim()).then(() => setDone('once')).catch(() => toast(t('n.cm.fail')));
  };
  const begin = () => {
    if (!valid) { setErr(true); return; }
    setErr(false);
    setBusy(true);
    startSip(id, value)
      .then((r) => setCheckout(r))
      .catch((e: Error) => toast(e.message || t('n.cm.fail')))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet visible onClose={closeSheet} title={t('lv.dTitle')} subtitle={<Text style={s.note}>{c.title}</Text>}>
      {done ? (
        <>
          <Notice tone="green" text={t(done === 'month' ? 'sip.thanks' : 'lv.thanks')} />
          <Button label={t('c.close')} block onPress={closeSheet} />
        </>
      ) : (
        <>
          {cfg.enabled ? (
            <Segmented stretch label={t('sip.mode')} selected={mode} onSelect={(m) => { setMode(m as 'once' | 'month'); setErr(false); }} items={[{ id: 'once', label: t('sip.once') }, { id: 'month', label: t('sip.month') }]} />
          ) : null}
          <Notice tone="blue" text={t(monthly ? 'sip.note' : 'lv.note')} />
          <Text style={styles.label}>{t(monthly ? 'sip.amount' : 'lv.amount')}</Text>
          <View style={styles.chips}>
            {AMOUNTS.map((a) => (
              <Text key={a} onPress={() => { setAmount(a); setCustom(''); }} accessibilityRole="button" style={[styles.chip, !custom.trim() && amount === a && styles.chipOn]}>{inr(a)}</Text>
            ))}
          </View>
          <TextInput style={styles.input} value={custom} onChangeText={setCustom} keyboardType="number-pad" placeholder={t(monthly ? 'sip.other' : 'lv.other')} placeholderTextColor={colors.slate} maxLength={6} />
          {err ? <Text style={styles.err}>{t(monthly ? 'sip.amtErr' : 'lv.amtErr')}</Text> : null}

          {monthly ? (
            <>
              {cfg.payeeName ? <Text style={styles.small}>{t('sip.to', { n: cfg.payeeName, h: cfg.payeeHint })}</Text> : null}
              <Button label={`${t('sip.start')} · ${valid ? t('sip.perMonth', { a: inr(value) }) : ''}`} block disabled={busy} onPress={begin} />
              <Text style={styles.small}>{t('sip.cancel')}</Text>
            </>
          ) : (
            <>
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
        </>
      )}
      {checkout ? (
        <SipCheckout
          visible
          keyId={checkout.keyId}
          subscriptionId={checkout.subscriptionId}
          description={c.title.slice(0, 80)}
          name={user?.name ?? ''}
          email={user?.email ?? ''}
          onDone={(r, d) => {
            setCheckout(null);
            if (r === 'ok') setDone('month');
            else if (r === 'fail') toast(d || t('sip.failed'));
          }}
        />
      ) : null}
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
  small: { fontSize: 13, color: colors.slate },
});
