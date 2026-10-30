// Installed-app donation. Pick Once or Every month, then an amount.
//  Once: pay the organiser's UPI ID in your own UPI app, then tell us you paid so the organiser can confirm it.
//  Every month, reminder mode (free): choose an amount and a day. Each month the phone reminds you and opens your UPI app to pay the
//     UPI ID the admin set; you tap "I have paid" and the admin confirms it.
//  Every month, autopay mode: approve a UPI AutoPay mandate once through Razorpay's checkout; it is then charged every month.
// If someone closes the sheet without giving, one friendly "Before you go" screen appears (once, never twice, with a clear "Not now").
// No card or bank details are ever typed into GoodNeighbour.
import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import Icon from '../components/Icon';
import Sheet, { sheetStyles as s } from '../components/Sheet';
import SipCheckout from '../components/SipCheckout';
import { Button, Notice, Segmented } from '../components/ui';
import { campaignOf } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { recordDonation, upiUrl } from '../state/donations';
import { SIP_MAX, SIP_MIN, recordMonthlyPayment, scheduleReminder, startAutopay, startReminder, useMySips, useSipConfig } from '../state/sip';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme';

const TILES = [100, 500, 1500];
const ONCE = [100, 500, 1000, 2500];
const DAYS = [1, 5, 10, 15, 20, 25];

export default function LiveDonateSheet({ id, sip: dueSip }: { id: string; sip?: string }) {
  const { t } = useT();
  const { closeSheet, user, toast } = useStore();
  const cfg = useSipConfig();
  const mine = useMySips(user?.uid);
  const c = campaignOf(id)!;
  const due = dueSip ? mine.find((x) => x.id === dueSip) : undefined; // opened from a monthly reminder: go straight to paying this month

  const [mode, setMode] = useState<'once' | 'month'>(dueSip ? 'month' : 'once');
  const [amount, setAmount] = useState(500);
  const [other, setOther] = useState(false);
  const [custom, setCustom] = useState('');
  const [day, setDay] = useState(5);
  const [ref, setRef] = useState('');
  const [opened, setOpened] = useState(false);
  const [done, setDone] = useState<'' | 'once' | 'month' | 'plan'>('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<{ id: string; amount: number } | null>(null); // reminder plan saved, first payment next
  const [remOk, setRemOk] = useState(true);
  const [view, setView] = useState<'form' | 'nudge'>('form');
  const [nudged, setNudged] = useState(false);
  const [checkout, setCheckout] = useState<{ keyId: string; subscriptionId: string } | null>(null);

  const monthly = mode === 'month';
  const lo = monthly ? SIP_MIN : 10;
  const hi = monthly ? SIP_MAX : 100000;
  const value = other ? Number(custom.trim()) : amount;
  const valid = Number.isInteger(value) && value >= lo && value <= hi;
  const medical = c.cat === 'medical';
  const payAmount = due ? due.amount : plan ? plan.amount : value;
  const sipRef = due ? { id: due.id, postId: due.postId, title: due.title, amount: due.amount } : plan ? { id: plan.id, postId: id, title: c.title, amount: plan.amount } : null;

  const requestClose = () => {
    if (done || opened || nudged || view === 'nudge' || due) { closeSheet(); return; }
    setNudged(true);
    setView('nudge');
  };

  const openUpi = (to: string, amt: number) => {
    const url = upiUrl(to, c.title, amt);
    if (!url) { toast(t('lv.noUpi')); return; }
    Linking.openURL(url).then(() => setOpened(true)).catch(() => toast(t('lv.noApp')));
  };
  const payOnce = () => {
    if (!valid) { setErr(true); return; }
    setErr(false);
    openUpi(c.payLink ?? '', value);
  };
  const paidOnce = () => {
    if (!user?.uid) return;
    recordDonation(user, id, c.title, value, ref.trim()).then(() => setDone('once')).catch(() => toast(t('n.cm.fail')));
  };
  const paidMonthly = () => {
    if (!user?.uid || !sipRef) return;
    recordMonthlyPayment(user, sipRef).then(() => setDone(due ? 'month' : 'plan')).catch(() => toast(t('n.cm.fail')));
  };

  const begin = () => {
    if (!valid) { setErr(true); return; }
    setErr(false);
    if (!user?.uid) return;
    setBusy(true);
    if (cfg.mode === 'autopay') {
      startAutopay(id, value).then((r) => setCheckout(r)).catch((e: Error) => toast(e.message || t('n.cm.fail'))).finally(() => setBusy(false));
      return;
    }
    if (!cfg.payeeUpi) { setBusy(false); toast(t('sip.noUpi')); return; }
    startReminder(user, id, c.title, value, day)
      .then(async (sipId) => {
        setRemOk(await scheduleReminder({ id: sipId, postId: id, title: c.title, amount: value, day }, { title: t('sip.remTitle'), body: t('sip.remBody', { a: inr(value), c: c.title }) }));
        setPlan({ id: sipId, amount: value });
      })
      .catch(() => toast(t('n.cm.fail')))
      .finally(() => setBusy(false));
  };

  const hearts = (n: number) => '♥'.repeat(n);

  // ------------------------------------------------------------------ the "Before you go" screen
  if (view === 'nudge') {
    return (
      <Sheet visible onClose={closeSheet} title={t('nudge.title')}>
        <View style={styles.heroWrap}>
          <View style={styles.ringOuter}><View style={styles.ringInner}><Icon name="heart" size={44} color={colors.heart} /></View></View>
        </View>
        <Text style={styles.nudgeBody}>{t(`nudge.${monthly ? 'm' : 'o'}${medical ? 'Med' : ''}`, { a: inr(valid ? value : 500) })}</Text>
        <Button label={t(monthly ? 'nudge.yesM' : 'nudge.yes', { a: inr(valid ? value : 500) })} block onPress={() => setView('form')} />
        {valid && value > 100 ? <Button label={t('nudge.less', { a: inr(100) })} block variant="ghost" onPress={() => { setOther(false); setAmount(100); setCustom(''); setView('form'); }} /> : null}
        <Text style={styles.notNow} accessibilityRole="button" onPress={closeSheet}>{t('nudge.no')}</Text>
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={requestClose} title={t(due ? 'sip.dueTitle' : monthly ? 'sip.title' : 'lv.dTitle')} subtitle={<Text style={s.note}>{c.title}</Text>}>
      {done ? (
        <>
          <Notice tone="green" text={t(done === 'once' ? 'lv.thanks' : done === 'plan' ? 'sip.thanksR' : 'sip.thanks', { d: day })} />
          {done === 'plan' && !remOk ? <Notice tone="red" text={t('sip.noNotif')} /> : null}
          <Button label={t('c.close')} block onPress={closeSheet} />
        </>
      ) : plan || due ? (
        // reminder mode, step 2: pay this month's gift in the UPI app
        <>
          <Notice tone="blue" text={t('sip.payNote', { a: inr(payAmount) })} />
          {plan && !remOk ? <Notice tone="red" text={t('sip.noNotif')} /> : null}
          {cfg.payeeName ? <Text style={styles.small}>{t('sip.to', { n: cfg.payeeName, h: cfg.payeeHint })}</Text> : null}
          <Button label={`${t('sip.payNow')} · ${inr(payAmount)}`} block onPress={() => openUpi(cfg.payeeUpi, payAmount)} />
          {opened ? <Button label={t('lv.paid')} block variant="ghost" onPress={paidMonthly} /> : null}
          {plan ? <Text style={styles.small}>{t('sip.skipFirst')}</Text> : null}
          {plan ? <Text style={styles.notNow} accessibilityRole="button" onPress={() => setDone('plan')}>{t('sip.payLater')}</Text> : null}
        </>
      ) : (
        <>
          {cfg.enabled ? (
            <Segmented stretch label={t('sip.mode')} selected={mode} onSelect={(m) => { setMode(m as 'once' | 'month'); setErr(false); }} items={[{ id: 'once', label: t('sip.once') }, { id: 'month', label: t('sip.month') }]} />
          ) : null}

          {monthly ? (
            <>
              <Text style={styles.heading}>{t('sip.heading')}</Text>
              <Notice tone="blue" text={t(cfg.mode === 'autopay' ? 'sip.noteAuto' : 'sip.noteRem')} />
              <View style={styles.grid}>
                {TILES.map((a) => {
                  const on = !other && amount === a;
                  return (
                    <View key={a} style={styles.cell}>
                      <Text onPress={() => { setOther(false); setAmount(a); setErr(false); }} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.tile, on && styles.tileOn]}>
                        <Text style={[styles.hearts, on && styles.tileOnText]}>{hearts(a === 100 ? 1 : a === 500 ? 2 : 3)}{'\n'}</Text>
                        <Text style={[styles.tileAmt, on && styles.tileOnText]}>{inr(a)}{'\n'}</Text>
                        <Text style={[styles.tileSub, on && styles.tileOnText]}>{t('sip.aMonth')}</Text>
                      </Text>
                      {a === 500 ? <Text style={styles.pick}>{t('sip.pick')}</Text> : null}
                    </View>
                  );
                })}
                <View style={styles.cell}>
                  <Text onPress={() => { setOther(true); setErr(false); }} accessibilityRole="button" accessibilityState={{ selected: other }} style={[styles.tile, other && styles.tileOn]}>
                    <Text style={[styles.hearts, other && styles.tileOnText]}>{'♥♥♥♥'}{'\n'}</Text>
                    <Text style={[styles.tileAmt, other && styles.tileOnText]}>{t('sip.otherT')}{'\n'}</Text>
                    <Text style={[styles.tileSub, other && styles.tileOnText]}>{t('sip.aMonth')}</Text>
                  </Text>
                </View>
              </View>
              {other ? <TextInput style={styles.input} value={custom} onChangeText={setCustom} keyboardType="number-pad" placeholder={t('sip.other')} placeholderTextColor={colors.slate} maxLength={5} autoFocus /> : null}
              {err ? <Text style={styles.err}>{t('sip.amtErr')}</Text> : null}

              {cfg.mode === 'reminder' ? (
                <>
                  <Text style={styles.label}>{t('sip.day')}</Text>
                  <View style={styles.chips}>
                    {DAYS.map((dd) => <Text key={dd} onPress={() => setDay(dd)} accessibilityRole="button" style={[styles.chip, day === dd && styles.chipOn]}>{dd}</Text>)}
                  </View>
                </>
              ) : null}
              {cfg.payeeName ? <Text style={styles.small}>{t('sip.to', { n: cfg.payeeName, h: cfg.payeeHint })}</Text> : null}
              <Button label={`${t('sip.start')} · ${valid ? t('sip.perMonth', { a: inr(value) }) : ''}`} block disabled={busy} onPress={begin} />
              <Text style={styles.small}>{t('sip.cancel')}</Text>
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
              <Button label={`${t('lv.pay')} · ${valid ? inr(value) : ''}`} block onPress={payOnce} />
              {opened ? (
                <>
                  <Text style={styles.label}>{t('lv.after')}</Text>
                  <TextInput style={styles.input} value={ref} onChangeText={setRef} keyboardType="number-pad" placeholder={t('lv.ref')} placeholderTextColor={colors.slate} maxLength={20} />
                  <Button label={t('lv.paid')} block variant="ghost" onPress={paidOnce} />
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
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.ink, marginTop: space.s },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: space.m },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  cell: { width: '48%', flexGrow: 1 },
  tile: { textAlign: 'center', paddingVertical: 16, paddingHorizontal: 8, borderRadius: radius.m, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.paper, overflow: 'hidden' },
  tileOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  tileOnText: { color: colors.white },
  hearts: { fontSize: 14, lineHeight: 22, color: colors.heart },
  tileAmt: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.ink },
  tileSub: { fontSize: 13, color: colors.slate },
  pick: { alignSelf: 'center', marginTop: -10, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: '#F5C451', color: colors.ink, fontSize: 11, fontWeight: '800', overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.s },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, color: colors.tealDark, fontWeight: '700', overflow: 'hidden' },
  chipOn: { backgroundColor: colors.tealDark, color: colors.white, borderColor: colors.tealDark },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.m, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink, marginTop: space.s, marginBottom: space.s },
  err: { color: '#B4262C', fontSize: 14 },
  small: { fontSize: 13, color: colors.slate },
  heroWrap: { alignItems: 'center', marginVertical: space.m },
  ringOuter: { width: 130, height: 130, borderRadius: 65, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFD0D5' },
  nudgeBody: { fontSize: 18, lineHeight: 26, color: colors.ink, textAlign: 'center', marginBottom: space.m },
  notNow: { textAlign: 'center', paddingVertical: space.m, fontSize: 15, fontWeight: '700', color: colors.slate },
});
