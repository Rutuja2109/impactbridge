// Monthly giving to one cause (and its NGO). Step 1: read about the NGO, pick a monthly amount and a reminder day. Step 2: pay this
// month's gift in your own UPI app (PhonePe, GPay ...) to the NGO's UPI ID, then tell us you paid so the admin team can confirm it.
// Each month the phone reminds you and opens the same screen. Closing early shows one friendly "Before you go" screen.
// No card or bank details are ever typed into GoodNeighbour.
import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import Icon, { type IconName } from '../components/Icon';
import Sheet from '../components/Sheet';
import { Button, Notice } from '../components/ui';
import { catOf, type CauseId } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { upiUrl } from '../state/donations';
import { SIP_MAX, SIP_MIN, recordMonthlyPayment, scheduleReminder, startReminder, useMySips, useSipConfig } from '../state/sip';
import { tierLine, useActiveSipCauses, useCauseDonors, useSipCauses, type SipCause } from '../state/sipCauses';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme';

const DAYS = [1, 5, 10, 15, 20, 25];

/** A cause stand-in for plans made before causes existed (they paid one default receiver). */
const legacy = (title: string, upi: string, ngo: string): SipCause => ({ id: '', cat: 'medical', title, ngo, about: '', upi, reg: '', site: '', img: '', logo: '', tiers: [], active: true, order: 0, total: 0, payments: 0 });

export default function MonthlySheet({ id, sip: dueSip }: { id: string; sip?: string }) {
  const { t } = useT();
  const { closeSheet, user, toast } = useStore();
  const cfg = useSipConfig();
  const causes = useSipCauses();
  const mine = useMySips(user?.uid);
  const due = dueSip ? mine.find((x) => x.id === dueSip) : undefined; // opened from a reminder or from Impact: go straight to paying
  const found = causes.find((c) => c.id === (id || due?.causeId));
  const cause = found ?? (due ? legacy(due.title, cfg.payeeUpi, cfg.payeeName) : null);
  const donors = useCauseDonors(cause?.id || null);

  const [amount, setAmount] = useState(500);
  const [other, setOther] = useState(false);
  const [custom, setCustom] = useState('');
  const [day, setDay] = useState(5);
  const [plan, setPlan] = useState<{ id: string; amount: number } | null>(null);
  const [opened, setOpened] = useState(false);
  const [done, setDone] = useState<'' | 'plan' | 'paid'>('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remOk, setRemOk] = useState(true);
  const [view, setView] = useState<'form' | 'nudge'>('form');
  const [nudged, setNudged] = useState(false);

  if (!cause) return null;
  const accent = catOf(cause.cat as CauseId).color;
  const value = other ? Number(custom.trim()) : amount;
  const valid = Number.isInteger(value) && value >= SIP_MIN && value <= SIP_MAX;
  const payAmount = due ? due.amount : plan ? plan.amount : value;
  const sipRef = due ? { id: due.id, postId: due.postId, causeId: due.causeId, title: due.title, amount: due.amount } : plan ? { id: plan.id, causeId: cause.id, title: cause.title, amount: plan.amount } : null;
  const medical = cause.cat === 'medical';

  const requestClose = () => {
    if (done || opened || nudged || view === 'nudge' || due) { closeSheet(); return; }
    setNudged(true);
    setView('nudge');
  };
  const openUpi = () => {
    const url = upiUrl(cause.upi, cause.ngo || cause.title, payAmount);
    if (!url) { toast(t('lv.noUpi')); return; }
    Linking.openURL(url).then(() => setOpened(true)).catch(() => toast(t('lv.noApp')));
  };
  const begin = () => {
    if (!valid) { setErr(true); return; }
    setErr(false);
    if (!user?.uid) return;
    setBusy(true);
    startReminder(user, { causeId: cause.id }, cause.title, value, day)
      .then(async (sipId) => {
        setRemOk(await scheduleReminder({ id: sipId, postId: cause.id, title: cause.title, amount: value, day }, { title: t('sip.remTitle'), body: t('sip.remBody', { a: inr(value), c: cause.title }) }));
        setPlan({ id: sipId, amount: value });
      })
      .catch(() => toast(t('n.cm.fail')))
      .finally(() => setBusy(false));
  };
  const paid = () => {
    if (!user?.uid || !sipRef) return;
    recordMonthlyPayment(user, sipRef).then(() => setDone(due ? 'paid' : 'plan')).catch(() => toast(t('n.cm.fail')));
  };

  // ------------------------------------------------------------------ "Before you go"
  if (view === 'nudge') {
    return (
      <Sheet visible onClose={closeSheet} title={t('nudge.title')}>
        <View style={styles.heroWrap}><View style={styles.ringOuter}><View style={styles.ringInner}><Icon name="heart" size={44} color={colors.heart} /></View></View></View>
        <Text style={styles.nudgeBody}>{t(`nudge.m${medical ? 'Med' : ''}`, { a: inr(valid ? value : 500) })}</Text>
        <Button label={t('nudge.yesM', { a: inr(valid ? value : 500) })} block onPress={() => setView('form')} />
        {valid && value > 100 ? <Button label={t('nudge.less', { a: inr(100) })} block variant="ghost" onPress={() => { setOther(false); setAmount(100); setCustom(''); setView('form'); }} /> : null}
        <Text style={styles.notNow} accessibilityRole="button" onPress={closeSheet}>{t('nudge.no')}</Text>
      </Sheet>
    );
  }

  // ------------------------------------------------------------------ the NGO header
  const head = (
    <View>
      <View style={[styles.cover, { backgroundColor: accent }]}>
        {cause.img ? <Image source={{ uri: `data:image/jpeg;base64,${cause.img}` }} style={styles.coverImg} resizeMode="cover" accessibilityIgnoresInvertColors /> : <Icon name={cause.cat as IconName} size={64} color="rgba(255,255,255,0.55)" />}
      </View>
      <View style={styles.logoRow}>
        <View style={[styles.logo, { borderColor: accent }]}>
          {cause.logo ? <Image source={{ uri: `data:image/jpeg;base64,${cause.logo}` }} style={styles.logoImg} /> : <Text style={[styles.logoLetter, { color: accent }]}>{(cause.ngo || cause.title).slice(0, 1).toUpperCase()}</Text>}
        </View>
        <View style={styles.flex}>
          <Text style={styles.ngo} numberOfLines={2}>{cause.ngo || cause.title}</Text>
          {cause.reg ? <Text style={styles.reg}>✓ {t('mg.reg', { n: cause.reg })}</Text> : null}
        </View>
      </View>
      {cause.about ? <Text style={styles.about}>{cause.about}</Text> : null}
      {cause.id ? (
        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statN}>{inr(cause.total)}</Text><Text style={styles.statL}>{t('mg.raised')}</Text></View>
          <View style={styles.stat}><Text style={styles.statN}>{donors}</Text><Text style={styles.statL}>{t('mg.donors')}</Text></View>
        </View>
      ) : null}
      {cause.site ? <Text style={styles.site} onPress={() => { Linking.openURL(/^https?:\/\//i.test(cause.site) ? cause.site : `https://${cause.site}`).catch(() => undefined); }}>{cause.site}</Text> : null}
    </View>
  );

  return (
    <Sheet visible onClose={requestClose} title={t(due || plan ? 'sip.dueTitle' : 'mg.title')} subtitle={cause.title}>
      {done ? (
        <>
          <View style={styles.heroWrap}><View style={styles.ringOuter}><View style={styles.ringInner}><Icon name="heart" size={44} color={colors.heart} /></View></View></View>
          <Notice tone="green" text={t(done === 'plan' ? 'sip.thanksR' : 'mg.paidThanks', { d: day })} />
          {done === 'plan' && !remOk ? <Notice tone="red" text={t('sip.noNotif')} /> : null}
          <Button label={t('c.close')} block onPress={closeSheet} />
        </>
      ) : plan || due ? (
        <>
          {head}
          <Notice tone="blue" text={t('sip.payNote', { a: inr(payAmount) })} />
          {plan && !remOk ? <Notice tone="red" text={t('sip.noNotif')} /> : null}
          <Button label={`${t('sip.payNow')} · ${inr(payAmount)}`} block onPress={openUpi} />
          {opened ? <Button label={t('lv.paid')} block variant="ghost" onPress={paid} /> : null}
          {plan ? <Text style={styles.small}>{t('sip.skipFirst')}</Text> : null}
          {plan ? <Text style={styles.notNow} accessibilityRole="button" onPress={() => setDone('plan')}>{t('sip.payLater')}</Text> : null}
        </>
      ) : (
        <>
          {head}
          <Text style={styles.heading}>{t('mg.choose')}</Text>
          <View style={styles.grid}>
            {cause.tiers.concat(cause.tiers.length ? [] : []).map((tr, i) => {
              const on = !other && amount === tr.amount;
              return (
                <View key={tr.amount} style={styles.cell}>
                  <Text onPress={() => { setOther(false); setAmount(tr.amount); setErr(false); }} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.tile, on && { backgroundColor: accent, borderColor: accent }]}>
                    <Text style={[styles.hearts, on && styles.onText]}>{'♥'.repeat(Math.min(4, i + 1))}{'\n'}</Text>
                    <Text style={[styles.tileAmt, on && styles.onText]}>{inr(tr.amount)}{'\n'}</Text>
                    <Text style={[styles.tileSub, on && styles.onText]}>{t('sip.aMonth')}</Text>
                  </Text>
                  {i === 1 ? <Text style={styles.pick}>{t('sip.pick')}</Text> : null}
                </View>
              );
            })}
            <View style={styles.cell}>
              <Text onPress={() => { setOther(true); setErr(false); }} accessibilityRole="button" accessibilityState={{ selected: other }} style={[styles.tile, other && { backgroundColor: accent, borderColor: accent }]}>
                <Text style={[styles.hearts, other && styles.onText]}>{'♥♥♥♥'}{'\n'}</Text>
                <Text style={[styles.tileAmt, other && styles.onText]}>{t('sip.otherT')}{'\n'}</Text>
                <Text style={[styles.tileSub, other && styles.onText]}>{t('sip.aMonth')}</Text>
              </Text>
            </View>
          </View>
          {!other ? <Text style={styles.impact}>{tierLine(cause.tiers.find((x) => x.amount === amount) ?? { amount, text: '' }, t('mg.tierDefault', { a: inr(amount) }))}</Text> : null}
          {other ? <TextInput style={styles.input} value={custom} onChangeText={setCustom} keyboardType="number-pad" placeholder={t('sip.other')} placeholderTextColor={colors.slate} maxLength={5} autoFocus /> : null}
          {err ? <Text style={styles.err}>{t('sip.amtErr')}</Text> : null}

          <Text style={styles.label}>{t('sip.day')}</Text>
          <View style={styles.chips}>
            {DAYS.map((dd) => <Text key={dd} onPress={() => setDay(dd)} accessibilityRole="button" style={[styles.chip, day === dd && styles.chipOn]}>{dd}</Text>)}
          </View>
          <Notice tone="blue" text={t('sip.noteRem')} />
          <Button label={`${t('mg.start')} · ${valid ? t('sip.perMonth', { a: inr(value) }) : ''}`} block disabled={busy} onPress={begin} />
          <Text style={styles.small}>{t('sip.cancel')}</Text>
        </>
      )}
    </Sheet>
  );
}

/** Used by the Home cards to say "Give monthly" with the smallest amount. */
export const minTier = (c: SipCause) => (c.tiers.length ? Math.min(...c.tiers.map((x) => x.amount)) : 100);
export { useActiveSipCauses };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cover: { height: 150, borderRadius: radius.m, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverImg: { width: '100%', height: '100%' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, marginTop: -28, paddingHorizontal: space.m },
  logo: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.white, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  logoLetter: { fontSize: 26, fontWeight: '800' },
  ngo: { fontSize: 18, lineHeight: 23, fontWeight: '800', color: colors.ink, marginTop: 30 },
  reg: { fontSize: 12, fontWeight: '800', color: colors.leaf },
  about: { fontSize: 15, lineHeight: 22, color: colors.slate, marginTop: space.s },
  stats: { flexDirection: 'row', gap: space.s, marginTop: space.s },
  stat: { flex: 1, alignItems: 'center', paddingVertical: space.s, borderRadius: radius.s, backgroundColor: colors.tealSoft },
  statN: { fontSize: 18, fontWeight: '800', color: colors.tealDeep },
  statL: { fontSize: 12, color: colors.tealDeep },
  site: { fontSize: 14, fontWeight: '700', color: colors.tealDark, marginTop: space.s },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.ink, marginTop: space.m },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: space.s },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  cell: { width: '48%', flexGrow: 1 },
  tile: { textAlign: 'center', paddingVertical: 16, paddingHorizontal: 8, borderRadius: radius.m, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.paper, overflow: 'hidden' },
  onText: { color: colors.white },
  hearts: { fontSize: 14, lineHeight: 22, color: colors.heart },
  tileAmt: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.ink },
  tileSub: { fontSize: 13, color: colors.slate },
  pick: { alignSelf: 'center', marginTop: -10, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: '#F5C451', color: colors.ink, fontSize: 11, fontWeight: '800', overflow: 'hidden' },
  impact: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.tealDeep, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.line, color: colors.tealDark, fontWeight: '700', overflow: 'hidden' },
  chipOn: { backgroundColor: colors.tealDark, color: colors.white, borderColor: colors.tealDark },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.m, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink },
  err: { color: colors.brick, fontSize: 14 },
  small: { fontSize: 13, color: colors.slate },
  heroWrap: { alignItems: 'center', marginVertical: space.m },
  ringOuter: { width: 130, height: 130, borderRadius: 65, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFD0D5' },
  nudgeBody: { fontSize: 18, lineHeight: 26, color: colors.ink, textAlign: 'center', marginBottom: space.m },
  notNow: { textAlign: 'center', paddingVertical: space.m, fontSize: 15, fontWeight: '700', color: colors.slate },
});
