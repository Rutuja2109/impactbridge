// Admin: the monthly giving causes (the cards on Home). Add 4 or 5, each with one NGO: its name, a short description, UPI ID, optional 80G or
// registration number, website, a cover picture and logo, and up to three suggested monthly amounts with what each does. Turn a card off
// to hide it without losing it. English only (staff screen).
import { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';

import { categories } from '../data';
import { inr } from '../format';
import { pickPhoto } from '../state/files';
import { UPI_ID } from '../state/donations';
import { DEFAULT_TIERS, loadSampleCauses, removeCause, removeSampleCauses, saveCause, useSipCauses, type SipCause, type Tier } from '../state/sipCauses';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme';
import { ViewAll, useCap } from './Capped';
import Sheet from './Sheet';
import { Button } from './ui';

const CATS = categories.map((c) => ({ id: c.id, label: ({ medical: 'Health', animals: 'Animals', education: 'Education', food: 'Food', environment: 'Environment' } as Record<string, string>)[c.id] ?? c.id }));

type Form = { cat: string; title: string; ngo: string; about: string; upi: string; reg: string; site: string; img: string; logo: string; tiers: { amount: string; text: string }[]; active: boolean };
const blank = (): Form => ({ cat: 'medical', title: '', ngo: '', about: '', upi: '', reg: '', site: '', img: '', logo: '', tiers: DEFAULT_TIERS.map((t) => ({ amount: String(t.amount), text: '' })), active: true });
const fromCause = (c: SipCause): Form => ({ ...c, tiers: [...c.tiers, ...DEFAULT_TIERS].slice(0, 3).map((t) => ({ amount: String(t.amount), text: t.text })) });

function Editor({ id, form, onClose }: { id: string | null; form: Form; onClose: () => void }) {
  const { toast } = useStore();
  const [f, setF] = useState<Form>(form);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setTier = (i: number, k: 'amount' | 'text', v: string) => setF((x) => ({ ...x, tiers: x.tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));

  const pick = (kind: 'img' | 'logo') => {
    pickPhoto(kind).then((a) => { if (a) set(kind, kind === 'img' ? (a.b64 ?? '') : (a.thumb ?? '')); }).catch(() => toast('Could not use that photo'));
  };
  const save = () => {
    const tiers: Tier[] = f.tiers.map((t) => ({ amount: Number(t.amount), text: t.text.trim() })).filter((t) => Number.isInteger(t.amount) && t.amount >= 100 && t.amount <= 15000);
    if (f.title.trim().length < 3) { toast('Give the cause a title'); return; }
    if (f.ngo.trim().length < 2) { toast('Enter the NGO name'); return; }
    if (!UPI_ID.test(f.upi.trim())) { toast('Enter a valid UPI ID, like name@okbank'); return; }
    if (!tiers.length) { toast('Add at least one amount between ₹100 and ₹15,000'); return; }
    setBusy(true);
    saveCause(id, { cat: f.cat, title: f.title, ngo: f.ngo, about: f.about, upi: f.upi, reg: f.reg, site: f.site, img: f.img, logo: f.logo, tiers, active: f.active })
      .then(() => { toast('Saved'); onClose(); })
      .catch(() => toast('Could not save. Publish the latest rules.'))
      .finally(() => setBusy(false));
  };
  const input = (k: keyof Form, label: string, o: { ph?: string; multi?: boolean; auto?: 'none' } = {}) => (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput value={String(f[k])} onChangeText={(v) => set(k, v as never)} placeholder={o.ph} placeholderTextColor={colors.slate} multiline={o.multi} autoCapitalize={o.auto} style={[s.input, o.multi && s.area]} />
    </View>
  );

  return (
    <Sheet visible onClose={onClose} title={id ? 'Edit monthly cause' : 'Add a monthly cause'}>
      <Text style={s.label}>Category</Text>
      <View style={s.chips}>{CATS.map((c) => <Text key={c.id} onPress={() => set('cat', c.id)} accessibilityRole="button" style={[s.chip, f.cat === c.id && s.chipOn]}>{c.label}</Text>)}</View>
      {input('title', 'Card title', { ph: 'e.g. Health for every family' })}
      {input('ngo', 'NGO name', { ph: 'e.g. Aarohan Health Trust' })}
      {input('about', 'About the NGO (2 to 3 lines)', { multi: true })}
      {input('upi', 'UPI ID donors pay to', { ph: 'name@okbank', auto: 'none' })}
      {input('reg', '80G or registration number (optional)', { auto: 'none' })}
      {input('site', 'Website (optional)', { auto: 'none' })}

      <Text style={s.label}>Pictures</Text>
      <View style={s.row}>
        <View style={s.flex}>
          {f.img ? <Image source={{ uri: `data:image/jpeg;base64,${f.img}` }} style={s.cover} /> : <View style={[s.cover, s.empty]}><Text style={s.hint}>No cover</Text></View>}
          <Button label={f.img ? 'Change cover' : 'Add cover'} small block variant="ghost" onPress={() => pick('img')} />
        </View>
        <View style={s.flex}>
          {f.logo ? <Image source={{ uri: `data:image/jpeg;base64,${f.logo}` }} style={s.logo} /> : <View style={[s.logo, s.empty]}><Text style={s.hint}>No logo</Text></View>}
          <Button label={f.logo ? 'Change logo' : 'Add logo'} small block variant="ghost" onPress={() => pick('logo')} />
        </View>
      </View>

      <Text style={s.label}>Suggested monthly amounts (₹100 to ₹15,000)</Text>
      {f.tiers.map((t, i) => (
        <View key={i} style={s.row}>
          <TextInput value={t.amount} onChangeText={(v) => setTier(i, 'amount', v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={5} placeholder="₹" placeholderTextColor={colors.slate} style={[s.input, s.amt]} />
          <TextInput value={t.text} onChangeText={(v) => setTier(i, 'text', v)} placeholder="What this does, e.g. Feeds a family for a month" placeholderTextColor={colors.slate} maxLength={80} style={[s.input, s.flex]} />
        </View>
      ))}
      <Button label={f.active ? 'Shown on Home: ON' : 'Shown on Home: OFF'} small block variant={f.active ? 'primary' : 'ghost'} onPress={() => set('active', !f.active)} />
      <Button label="Save" block disabled={busy} onPress={save} />
    </Sheet>
  );
}

export default function AdminCauses() {
  const { toast } = useStore();
  const causes = useSipCauses();
  const cap = useCap(causes, 3);
  const [edit, setEdit] = useState<{ id: string | null; form: Form } | null>(null);
  return (
    <View style={s.wrap}>
      <Text style={s.h}>Monthly giving causes</Text>
      <Text style={s.hint}>These are the cards on Home. Add 4 or 5, one NGO each. Money goes straight to the NGO's UPI ID and you confirm each payment under Money.</Text>
      {cap.shown.map((c) => (
        <View key={c.id} style={s.card}>
          <Text style={s.title}>{c.title}{c.active ? '' : '  (hidden)'}</Text>
          <Text style={s.hint}>{c.ngo} · {c.upi}</Text>
          <Text style={s.hint}>{inr(c.total)} confirmed · {c.payments} payment{c.payments === 1 ? '' : 's'}</Text>
          <View style={s.row}>
            <View style={s.flex}><Button label="Edit" small block variant="ghost" onPress={() => setEdit({ id: c.id, form: fromCause(c) })} /></View>
            <View style={s.flex}><Button label="Remove" small block variant="ghost" onPress={() => { removeCause(c.id).then(() => toast('Removed')).catch(() => toast('Could not remove')); }} /></View>
          </View>
        </View>
      ))}
      <ViewAll cap={cap} en />
      <Button label="Add a cause" block onPress={() => setEdit({ id: null, form: blank() })} />
      <View style={s.row}>
        <View style={s.flex}><Button label="Add sample causes" small block variant="ghost" onPress={() => { loadSampleCauses().then((n) => toast(`Added ${n} samples`)).catch(() => toast('Could not add. Publish the latest rules.')); }} /></View>
        <View style={s.flex}><Button label="Remove samples" small block variant="ghost" onPress={() => { removeSampleCauses().then((n) => toast(`Removed ${n}`)).catch(() => toast('Could not remove')); }} /></View>
      </View>
      {edit ? <Editor id={edit.id} form={edit.form} onClose={() => setEdit(null)} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: space.s, marginTop: space.l },
  h: { fontSize: 17, fontWeight: '800', color: colors.ink },
  hint: { fontSize: 13, color: colors.slate },
  card: { gap: 4, padding: space.m, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  title: { fontSize: 15, fontWeight: '800', color: colors.tealDark },
  row: { flexDirection: 'row', gap: space.s, alignItems: 'center' },
  flex: { flex: 1 },
  field: { gap: 4 },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: space.xs },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.s, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.ink, backgroundColor: colors.white },
  area: { minHeight: 80, textAlignVertical: 'top' },
  amt: { width: 90 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.line, color: colors.slate, fontSize: 13, fontWeight: '700', overflow: 'hidden' },
  chipOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark, color: colors.white },
  cover: { height: 90, borderRadius: radius.s, marginBottom: space.xs, width: '100%' },
  logo: { height: 90, width: 90, borderRadius: 45, marginBottom: space.xs, alignSelf: 'center' },
  empty: { backgroundColor: colors.greySoft, alignItems: 'center', justifyContent: 'center' },
});
