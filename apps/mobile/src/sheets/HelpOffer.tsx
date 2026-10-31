// "I can help" in the installed app. Step 1: choose time or items. Step 2: say how many you can give, what, when, and (optionally) how to
// reach you. Step 3: a thank-you note with your ticket number, who the organiser is, and where to follow it. The organiser gets a ticket
// they can answer, so both of you can track it by status and write to each other.
import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import Icon, { type IconName } from '../components/Icon';
import Sheet, { sheetStyles as s } from '../components/Sheet';
import { Button, Notice } from '../components/ui';
import { projectOf } from '../data';
import { useT } from '../i18n';
import { openTicket, ticketRef, type Ticket } from '../state/requests';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme';

type Kind = 'volunteer' | 'items';

function Choice({ icon, title, desc, onPress }: { icon: IconName; title: string; desc: string; onPress: () => void }) {
  return (
    <Text onPress={onPress} accessibilityRole="button" style={styles.choice}>
      <Text style={styles.choiceTitle}>{title}{'\n'}</Text>
      <Text style={styles.choiceDesc}>{desc}</Text>
    </Text>
  );
}

export default function HelpOffer({ id }: { id: string }) {
  const { t } = useT();
  const { closeSheet, user, toast, goTab } = useStore();
  const p = projectOf(id);
  const [step, setStep] = useState<'choose' | 'form' | 'done'>('choose');
  const [kind, setKind] = useState<Kind>('volunteer');
  const [qty, setQty] = useState('1');
  const [hours, setHours] = useState('');
  const [what, setWhat] = useState('');
  const [when, setWhen] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  if (!p) return null;

  const choose = (k: Kind) => { setKind(k); setStep('form'); };
  const submit = () => {
    const q = Number(qty);
    const bad = {
      qty: !Number.isInteger(q) || q < 1 || q > 9999,
      hours: !!hours.trim() && (!/^\d+$/.test(hours.trim()) || Number(hours) > 1000),
      what: what.trim().length < 3,
      phone: !!phone.trim() && !/^(\+?91[\s-]?)?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, '')),
    };
    setErr(bad);
    if (Object.values(bad).some(Boolean) || !user?.uid) return;
    setBusy(true);
    openTicket(user, id, { kind, qty: q, hours: hours.trim() ? Number(hours) : 0, what: what.trim(), when: when.trim(), phone: phone.trim() })
      .then((tk) => { setTicket(tk); setStep('done'); })
      .catch(() => toast(t('n.cm.fail')))
      .finally(() => setBusy(false));
  };

  const mail = process.env.EXPO_PUBLIC_ADMIN_EMAIL;
  const field = (label: string, value: string, set: (v: string) => void, opts: { hint?: string; k?: 'number-pad' | 'default' | 'phone-pad'; multi?: boolean; bad?: boolean; err?: string; req?: boolean; max?: number }) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label} <Text style={opts.req ? styles.req : styles.opt}>{t(opts.req ? 'req' : 'opt')}</Text></Text>
      {opts.hint ? <Text style={styles.hint}>{opts.hint}</Text> : null}
      <TextInput
        value={value}
        onChangeText={set}
        keyboardType={opts.k ?? 'default'}
        multiline={opts.multi}
        maxLength={opts.max ?? 200}
        accessibilityLabel={label}
        placeholderTextColor={colors.slate}
        style={[styles.input, opts.multi && styles.area, opts.bad && styles.inputErr]}
      />
      {opts.bad && opts.err ? <Text style={styles.err}>{opts.err}</Text> : null}
    </View>
  );

  if (step === 'done' && ticket) {
    return (
      <Sheet visible onClose={closeSheet} title={t('ho.thanksT')} subtitle={p.title}>
        <View style={styles.heroWrap}><View style={styles.ring}><Icon name="heart" size={40} color={colors.heart} /></View></View>
        <Text style={styles.thanks}>{t('ho.thanks', { n: user?.name?.split(' ')[0] ?? '' })}</Text>
        <View style={styles.ticket}>
          <Text style={styles.tkLabel}>{t('ho.ticket')}</Text>
          <Text style={styles.tkRef}>{ticketRef(ticket.postId, ticket.helperUid)}</Text>
          <Text style={styles.tkStatus}>{t('tk.st.requested')}</Text>
        </View>
        <Text style={styles.stepsT}>{t('ho.next')}</Text>
        <Text style={styles.step}>1. {t('ho.n1', { o: ticket.ownerName || t('ho.organiser') })}</Text>
        <Text style={styles.step}>2. {t('ho.n2')}</Text>
        <Text style={styles.step}>3. {t('ho.n3', { e: user?.email ?? '' })}</Text>
        <Button label={t('ho.track')} block onPress={() => { closeSheet(); goTab('impact'); }} />
        {mail ? <Button label={t('ho.support')} block variant="ghost" onPress={() => { Linking.openURL(`mailto:${mail}?subject=${encodeURIComponent(`Help ticket ${ticketRef(ticket.postId, ticket.helperUid)}`)}`).catch(() => undefined); }} /> : null}
        <Button label={t('c.close')} block variant="ghost" onPress={closeSheet} />
      </Sheet>
    );
  }

  if (step === 'form') {
    const vol = kind === 'volunteer';
    return (
      <Sheet visible onClose={closeSheet} title={t(vol ? 'ho.volTitle' : 'ho.itemsTitle')} subtitle={p.title}>
        <Notice tone="blue" text={t('ho.note')} />
        {field(t(vol ? 'ho.qtyVol' : 'ho.qtyItems'), qty, setQty, { k: 'number-pad', req: true, bad: err.qty, err: t('ho.qtyErr'), max: 4 })}
        {vol ? field(t('ho.hours'), hours, setHours, { k: 'number-pad', hint: t('ho.hoursH'), bad: err.hours, err: t('ho.hoursErr'), max: 4 }) : null}
        {field(t(vol ? 'ho.whatVol' : 'ho.whatItems'), what, setWhat, { multi: true, req: true, hint: t(vol ? 'ho.whatVolH' : 'ho.whatItemsH'), bad: err.what, err: t('ho.whatErr'), max: 300 })}
        {field(t('ho.when'), when, setWhen, { hint: t('ho.whenH'), max: 120 })}
        {field(t('ho.phone'), phone, setPhone, { k: 'phone-pad', hint: t('ho.phoneH'), bad: err.phone, err: t('ho.phoneErr'), max: 16 })}
        <Text style={s.note}>{t('n.rs.consent')}</Text>
        <Button label={t('ho.send')} block disabled={busy} onPress={submit} />
        <Button label={t('c.back')} block variant="ghost" onPress={() => setStep('choose')} />
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={closeSheet} title={t('help.title')} subtitle={p.title}>
      <Choice icon="hand" title={t('help.volT')} desc={p.volsNeeded - p.vols <= 0 ? t('hr.volOpen') : t('help.volD', { n: p.volsNeeded - p.vols })} onPress={() => choose('volunteer')} />
      <Choice icon="tool" title={t('help.giveT')} desc={t('help.giveD')} onPress={() => choose('items')} />
      <Text style={s.note}>{t('ho.chooseNote')}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  choice: { padding: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white, overflow: 'hidden' },
  choiceTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  choiceDesc: { fontSize: 14, color: colors.slate },
  field: { gap: 4 },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink },
  req: { fontSize: 12, fontWeight: '800', color: colors.brick },
  opt: { fontSize: 12, fontWeight: '600', color: colors.slate },
  hint: { fontSize: 13, color: colors.slate },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.m, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink, backgroundColor: colors.white },
  area: { minHeight: 90, textAlignVertical: 'top' },
  inputErr: { borderColor: colors.brick },
  err: { fontSize: 13, color: colors.brick },
  heroWrap: { alignItems: 'center', marginTop: space.s },
  ring: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  thanks: { fontSize: 17, lineHeight: 24, color: colors.ink, textAlign: 'center' },
  ticket: { alignItems: 'center', gap: 4, padding: space.m, borderRadius: radius.m, backgroundColor: colors.tealSoft },
  tkLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: colors.tealDeep },
  tkRef: { fontSize: 26, fontWeight: '800', letterSpacing: 2, color: colors.tealDeep },
  tkStatus: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 999, backgroundColor: '#DCE6FF', color: '#2A3F8F', fontSize: 12, fontWeight: '800', overflow: 'hidden' },
  stepsT: { fontSize: 15, fontWeight: '800', color: colors.ink, marginTop: space.s },
  step: { fontSize: 14, lineHeight: 20, color: colors.slate },
});
