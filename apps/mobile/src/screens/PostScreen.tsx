// The prototype's post flows as native screens: five guided steps, a review and a confirmation, for "Report a problem",
// "Create a community project" and "Start a fundraiser". Rules and wording come from the prototype (state/post.ts and
// its text keys). Demonstration only: nothing is sent; drafts are saved on this device (never private details or files).
import { firebaseReady } from '../firebase';
import * as Location from 'expo-location';
import { pickPhoto } from '../state/files';
import { submitPost } from '../state/posts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoverArt } from '../components/Art';
import { NAV_HEIGHT } from '../components/BottomNav';
import Icon from '../components/Icon';
import { Badge, Button, CauseBadge, Notice, SampleTag } from '../components/ui';
import { categories, type CauseId } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { STRINGS } from '../i18n/strings.generated';
import { CHOICES, FILE_FIELDS, FLOWS, PRIVATE, fieldError, freshPost, isoDate, kindOf, specsOf, validateStep, visible, type Attach, type Flow, type PostState, type Spec } from '../state/post';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';

const has = (k: string) => k in (STRINGS.en as Record<string, string>);
const DRAFT_KEY = 'gn-draft';

export default function PostScreen({ flow }: { flow: Flow }) {
  const { t, formatDate } = useT();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const post = store.posts[flow];
  const d = post.data;
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const set = (fn: (p: PostState) => PostState) => store.setPost(flow, fn);
  const spec = FLOWS[flow];
  const lab = (pre: string, name: string) => t(has(`${pre}.${flow}.${name}`) ? `${pre}.${flow}.${name}` : `${pre}.${name}`);
  const hint = (name: string) => (has(`h.${flow}.${name}`) ? t(`h.${flow}.${name}`) : has(`h.${name}`) ? t(`h.${name}`) : '');
  const stepName = (n: number) => t(`${spec.s}${n}`);
  const str = (name: string) => (typeof d[name] === 'string' ? (d[name] as string) : '');
  const choices = (kind: string): [string, string][] => (kind === 'cats' ? categories.map((c) => [c.id, `cat.${c.id}`]) : CHOICES[kind]);

  // Restore a draft saved on this device, once, when a flow is opened untouched.
  useEffect(() => {
    if (post.step !== 1 || post.restored || post.mode !== 'form' || str('title') || str('story')) return;
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      const saved = raw ? JSON.parse(raw) : null;
      if (saved?.flow === flow && saved.data) set((p) => ({ ...p, data: { ...p.data, ...saved.data }, step: saved.step ?? 1, max: saved.step ?? 1, restored: true }));
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (step: number, mode: PostState['mode'] = 'form') => {
    set((p) => ({ ...p, step, mode, errors: {}, restored: false }));
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  // Installed app: the pin is the phone's real position (asked for permission first), saved as latitude and longitude.
  const pinMyLocation = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { store.toast(t('pin.denied')); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      set((p) => ({ ...p, data: { ...p.data, pin: true, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) } }));
    } catch { store.toast(t('pin.fail')); }
  };
  const clearLocation = () => set((p) => ({ ...p, data: { ...p.data, pin: false, lat: '', lng: '' } }));
  const setField = (name: string, value: PostState['data'][string]) =>
    set((p) => {
      const data = { ...p.data, [name]: value };
      const errors = { ...p.errors };
      if (errors[name] && !fieldError(flow, data, name)) delete errors[name];
      if (name === 'who' || name === 'ctype') { delete errors.orgName; delete errors.relation; }
      return { ...p, data, errors };
    });

  const next = () => {
    const errs = validateStep(flow, d, post.step);
    if (Object.keys(errs).length) { set((p) => ({ ...p, errors: errs })); store.toast(t('t.fix')); return; }
    if (post.step < 5) { set((p) => ({ ...p, max: Math.max(p.max, p.step + 1) })); goTo(post.step + 1); return; }
    for (let n = 1; n <= 5; n++) {
      const e = validateStep(flow, d, n);
      if (Object.keys(e).length) { goTo(n); set((p) => ({ ...p, errors: e })); store.toast(t('t.fix')); return; }
    }
    set((p) => ({ ...p, max: 5, fromReview: true })); goTo(post.step, 'review');
  };
  const saveDraft = () => {
    const keep = { ...d, files: [], cover: [], docs: [], private: '' };
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ flow, step: post.step, data: keep })).then(() => store.toast(t('t.saved'))).catch(() => store.toast(t('t.saveFail')));
  };
  const discard = () => { AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined); set(() => freshPost()); store.toast(t('t.discarded')); };
  const finish = (ref: string) => {
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined);
    set((p) => ({ ...p, mode: 'done', ref }));
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const submit = () => {
    // Installed app: the post is really saved (pending review). Expo Go: the old demo reference number.
    if (firebaseReady && store.user?.uid) submitPost(store.user, flow, d).then((id) => finish(spec.ref.replace('DEMO', 'POST') + id.slice(0, 6).toUpperCase())).catch(() => store.toast(t('n.cm.fail')));
    else finish(spec.ref + Math.floor(100000 + Math.random() * 900000));
  };

  // ---------- one field ----------
  const err = (name: string) => post.errors[name];
  const Field = ([name, kind, req]: Spec) => {
    if (!visible(flow, d, name)) return null;
    const e = err(name);
    const label = (
      <Text style={styles.label}>{lab('f', name)} <Text style={req ? styles.req : styles.opt}>{t(req ? 'req' : 'opt')}</Text></Text>
    );
    const help = hint(name) ? <Text style={styles.hint}>{hint(name)}</Text> : null;
    const errEl = e ? <Text style={styles.err} accessibilityLiveRegion="polite">{t(`e.${e}`)}</Text> : null;
    const wrap = (inner: React.ReactNode) => <View key={name} style={styles.field}>{inner}{errEl}</View>;
    const inputProps = { accessibilityLabel: lab('f', name), style: [styles.input, !!e && styles.inputErr] };

    if (kind === 'check') {
      const on = d[name] === true;
      return wrap(
        <Pressable onPress={() => setField(name, !on)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={styles.checkRow}>
          <View style={[styles.box, on && styles.boxOn, !!e && styles.inputErr]}>{on ? <Icon name="check" size={16} color={colors.white} strokeWidth={3} /> : null}</View>
          <Text style={styles.checkText}>{lab('f', name)} <Text style={req ? styles.req : styles.opt}>{t(req ? 'req' : 'opt')}</Text></Text>
        </Pressable>,
      );
    }
    if (kind === 'files' || kind === 'image') {
      const list = (d[name] as Attach[]) ?? [];
      const max = name === 'cover' ? 1 : 4;
      const addLive = () => {
        if (list.length >= max && name !== 'cover') { set((p) => ({ ...p, errors: { ...p.errors, [name]: 'files' } })); return; }
        pickPhoto(`${name === 'docs' ? 'document' : 'photo'}-${list.length + 1}.jpg`)
          .then((a) => { if (a) setField(name, name === 'cover' ? [a] : [...list, a]); })
          .catch((err: Error) => store.toast(t(err.message === 'big' ? 'pic.big' : 'pic.fail')));
      };
      const add = () => {
        if (list.length >= max && name !== 'cover') { set((p) => ({ ...p, errors: { ...p.errors, [name]: 'files' } })); return; }
        const n = list.length + 1;
        const a: Attach = { name: name === 'docs' ? `document-${n}.pdf` : `photo-${n}.jpg`, size: 120 * 1024 };
        setField(name, name === 'cover' ? [a] : [...list, a]);
      };
      return wrap(
        <>
          {label}{help}
          <Button label={t(kind === 'files' ? 'b.choose' : 'b.chooseCover')} icon="plus" variant="ghost" small onPress={firebaseReady ? addLive : add} style={styles.self} />
          {firebaseReady ? null : <Text style={styles.hint}>{t('n.attachDemo')}</Text>}
          {list.map((a, i) => (
            <View key={`${a.name}-${i}`} style={styles.fileRow}>
              <Text style={styles.fileName} numberOfLines={1}>📄 {a.name}</Text>
              <Text style={styles.hint}>{Math.max(1, Math.round(a.size / 1024))} KB</Text>
              <Text style={styles.link} accessibilityRole="button" accessibilityLabel={t('b.removeF', { f: a.name })} onPress={() => setField(name, list.filter((_, j) => j !== i))}>{t('b.remove')}</Text>
            </View>
          ))}
        </>,
      );
    }
    if (kind === 'pin') {
      return wrap(
        <>
          {label}{help}
          <TextInput {...inputProps} value={str(name)} onChangeText={(v) => setField(name, v)} maxLength={200} />
          <Button label={t(d.pin ? 'b.unpin' : 'b.pin')} icon="pin" variant={d.pin ? 'on' : 'ghost'} small onPress={() => (firebaseReady ? (d.pin ? clearLocation() : pinMyLocation()) : setField('pin', !d.pin))} style={styles.self} />
          {d.pin ? <Text style={styles.hint}>{t('pin.placed')}{firebaseReady ? '' : ` · ${t('n.pinNote')}`}</Text> : null}
        </>,
      );
    }
    if (kind !== 'text' && kind !== 'area' && kind !== 'num' && kind !== 'date') {
      // chips
      return wrap(
        <>
          {label}{help}
          <View style={styles.chips} accessibilityRole="radiogroup">
            {choices(kind).map(([v, k]) => {
              const on = d[name] === v;
              return (
                <Pressable key={v} onPress={() => setField(name, v)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(k)}</Text>
                </Pressable>
              );
            })}
          </View>
          {name === 'urgency' && d.urgency === 'emergency' ? <Notice tone="red" text={t('emerg')} /> : null}
          {name === 'relation' ? <Notice tone="blue" text={t('verInd')} /> : null}
        </>,
      );
    }
    const multiline = kind === 'area';
    return wrap(
      <>
        {label}{help}
        <TextInput
          {...inputProps}
          style={[styles.input, !!e && styles.inputErr, multiline && styles.multi]}
          value={str(name)}
          onChangeText={(v) => setField(name, v)}
          multiline={multiline}
          keyboardType={kind === 'num' ? 'number-pad' : name === 'private' ? 'email-address' : 'default'}
          autoCapitalize={kind === 'date' || name === 'private' ? 'none' : 'sentences'}
          autoCorrect={name !== 'private'}
          placeholder={kind === 'date' ? t('n.dateHint') : undefined}
          placeholderTextColor={colors.slate}
          maxLength={multiline ? 1000 : name === 'title' ? 100 : 200}
        />
        {name === 'desc' || name === 'story' ? <Text style={styles.counter}>{str(name).length}/1000</Text> : null}
        {name === 'orgName' && flow === 'fund' ? <View style={styles.inline}><Badge label={t('v.unverified')} tone="grey" /><Text style={styles.hint}>{t('verOrg')}</Text></View> : null}
      </>,
    );
  };

  // ---------- review pieces ----------
  const shown = (name: string): string => {
    const v = d[name]; const kind = kindOf(name);
    if (FILE_FIELDS.includes(name)) { const a = v as Attach[]; return a.length ? `${t(name === 'cover' ? 'rev.cover' : 'rev.files', { n: a.length })}: ${a.map((x) => x.name).join(', ')}` : ''; }
    if (kind === 'pin') return [str(name).trim(), d.pin ? t('rev.pin') : ''].filter(Boolean).join(' · ');
    if (kind === 'check') return v ? '✓' : '';
    if (kind !== 'text' && kind !== 'area' && kind !== 'num' && kind !== 'date') { const o = choices(kind).find(([x]) => x === v); return o ? t(o[1]) : ''; }
    if (kind === 'date') return str(name) ? formatDate(isoDate(str(name)), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    if ((name === 'budget' || name === 'goal') && str(name).trim()) return inr(Number(str(name)));
    return str(name).trim();
  };
  const cat = (d.cat || 'medical') as CauseId;
  const where = [str('area'), str('city')].map((x) => x.trim()).filter(Boolean).join(', ');
  const preview = (
    <View style={styles.card} accessibilityLabel={t('rev.public')}>
      <View>
        <CoverArt cause={cat} id="pv" height={140} placeholder="x" />
        <View style={styles.badges}>
          <Badge label={t('st.pending')} tone="amber" />
          {d.cat ? <CauseBadge cause={cat} /> : null}
          {flow === 'fund' ? <Badge label={t('v.unverified')} tone="grey" /> : d.urgency ? <Badge label={t(`urg.${str('urgency')}`)} tone={d.urgency === 'emergency' ? 'brick' : 'teal'} /> : null}
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{str('title')}</Text>
        <Text style={styles.small}>{flow === 'fund' ? `${t('cd.beneficiary')}: ${str('benName')} · ${t('cd.organizer')}: ${d.ctype === 'org' ? str('orgName') : str('display')}` : `${str('display')}${where ? ` · ${where}` : ''}`}</Text>
        {firebaseReady ? null : <SampleTag label={t('c.sample')} />}
        {flow === 'fund' ? <Text style={styles.small}>{t('fund.recvOf', { a: inr(0), b: inr(Number(str('goal')) || 0) }).replace(/<[^>]+>/g, '')}</Text> : null}
        <Text style={styles.body} numberOfLines={4}>{(flow === 'fund' ? str('story') : str('desc')).trim()}</Text>
      </View>
    </View>
  );

  const stepsBar = (
    <View style={styles.steps} accessibilityLabel={t('post.progress')}>
      {[1, 2, 3, 4, 5].map((n) => {
        const current = post.mode === 'form' && n === post.step;
        const done = !current && n <= post.max;
        const body = (
          <>
            <View style={[styles.sn, current && styles.snOn, done && styles.snDone]}>
              {done ? <Icon name="check" size={14} color={colors.white} strokeWidth={3} /> : <Text style={[styles.snText, current && { color: colors.white }]}>{n}</Text>}
            </View>
            <Text style={[styles.sl, current && styles.slOn]} numberOfLines={2}>{stepName(n)}</Text>
          </>
        );
        return n <= post.max && !current
          ? <Pressable key={n} onPress={() => goTo(n)} accessibilityRole="button" accessibilityLabel={t('post.goto', { n, s: stepName(n) })} style={styles.stepItem}>{body}</Pressable>
          : <View key={n} style={styles.stepItem} accessibilityState={{ selected: current }}>{body}</View>;
      })}
    </View>
  );

  // ---------- screens ----------
  const pad = { paddingBottom: NAV_HEIGHT + insets.bottom + space.xxl };
  if (post.mode === 'done') {
    const fund = flow === 'fund';
    return (
      <ScrollView ref={scroll} style={styles.screen} contentContainerStyle={[styles.wrap, pad]}>
        <View style={styles.success}><Icon name="check" size={34} color={colors.leaf} strokeWidth={2.6} /></View>
        <Text accessibilityRole="header" style={styles.h1}>{t('done.title')}</Text>
        <Text style={styles.label}>{t('done.ref')}</Text>
        <Text style={styles.ref}>{post.ref}</Text>
        <Text style={styles.label}>{t('done.status')}</Text>
        <View style={styles.inline}><Badge label={t('st.pending')} tone="amber" />{fund ? <Badge label={t('v.unverified')} tone="grey" /> : null}</View>
        <Text style={styles.body}>{fund ? t('done.fundBody', { t: str('title').trim() }) : t('done.body', { t: str('title').trim(), c: str('city').trim() })}</Text>
        {!fund && d.urgency === 'emergency' ? <Notice tone="red" text={t('emerg')} /> : null}
        <Notice tone="green" text={t('done.demo')} />
        <Button label={t('b.another')} block onPress={() => { set(() => freshPost()); }} />
        <Button label={t('b.home')} variant="ghost" block onPress={() => store.goTab('home')} />
      </ScrollView>
    );
  }
  if (post.mode === 'review') {
    const emergency = flow !== 'fund' && d.urgency === 'emergency';
    return (
      <ScrollView ref={scroll} style={styles.screen} contentContainerStyle={[styles.wrap, pad]}>
        <Text accessibilityRole="header" style={styles.h1}>{t('rev.title')}</Text>
        <Text style={styles.body}>{t('rev.sub')}</Text>
        {stepsBar}
        <Text style={styles.h2}>{t('rev.public')}</Text>
        <Text style={styles.small}>{t('rev.publicNote')}</Text>
        {preview}
        {[1, 2, 3, 4, 5].map((n) => {
          const pub = specsOf(flow, n).filter(([f]) => !PRIVATE.includes(f) && visible(flow, d, f));
          const priv = specsOf(flow, n).filter(([f]) => PRIVATE.includes(f) && visible(flow, d, f));
          return (
            <View key={n} style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.h2}>{stepName(n)}</Text>
                <Button label={t('b.edit')} variant="ghost" small onPress={() => goTo(n)} accessibilityLabel={t('b.editS', { s: stepName(n) })} />
              </View>
              {pub.map(([f]) => <View key={f}><Text style={styles.dt}>{lab('f', f)}</Text><Text style={styles.dd}>{shown(f) || '—'}</Text></View>)}
              {n === 1 ? <Text style={styles.hint}>{t('rev.written')}</Text> : null}
              {priv.length ? (
                <View style={styles.privateBox}>
                  <Text style={styles.label}>🔒 {t('rev.private')}</Text>
                  {priv.map(([f]) => <View key={f}><Text style={styles.dt}>{lab('f', f)}</Text><Text style={styles.dd}>{shown(f) || '—'}</Text></View>)}
                </View>
              ) : null}
            </View>
          );
        })}
        {emergency ? <Notice tone="red" text={t('emerg')} /> : null}
        {firebaseReady ? null : <Notice text={t('post.demo')} />}
        <View style={styles.nav}>
          <Button label={t('b.back')} variant="ghost" onPress={() => goTo(5)} style={styles.flex} />
          <Button label={t('b.submit')} onPress={submit} style={styles.flex} />
        </View>
      </ScrollView>
    );
  }
  return (
    <ScrollView ref={scroll} style={styles.screen} contentContainerStyle={[styles.wrap, pad]} keyboardShouldPersistTaps="handled">
      <Pressable onPress={store.back} accessibilityRole="button" style={styles.backRow} hitSlop={8}>
        <Icon name="back" size={20} color={colors.tealDark} />
        <Text style={styles.link}>{t('b.allTypes')}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.h1}>{t(spec.title)}</Text>
      <Text style={styles.body}>{t(spec.sub)}</Text>
      {firebaseReady ? null : <Notice text={t('post.demo')} />}
      {post.restored ? (
        <View style={styles.restored}>
          <Text style={[styles.small, styles.flex]}>{t('post.restored')}</Text>
          <Button label={t('b.discard')} variant="ghost" small onPress={discard} />
        </View>
      ) : null}
      {stepsBar}
      <Text accessibilityRole="header" style={styles.h2}>{stepName(post.step)}</Text>
      <Text style={styles.small}>{t('post.stepOf', { n: post.step, t: 5 })} · {t('post.reqNote')}</Text>
      {specsOf(flow, post.step).map(Field)}
      <View style={styles.nav}>
        {post.step > 1 ? <Button label={t('b.back')} variant="ghost" onPress={() => goTo(post.step - 1)} style={styles.flex} /> : null}
        <Button label={t('b.save')} variant="ghost" onPress={saveDraft} style={styles.flex} />
      </View>
      <View style={styles.nav}>
        {post.fromReview ? <Button label={t('b.toReview')} variant="ghost" onPress={() => { const e = validateStep(flow, d, post.step); if (Object.keys(e).length) { set((p) => ({ ...p, errors: e })); store.toast(t('t.fix')); } else goTo(post.step, 'review'); }} style={styles.flex} /> : null}
        <Button label={post.step < 5 ? t('b.next') : t('b.review')} onPress={next} style={styles.flex} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  wrap: { padding: space.l, gap: space.m },
  flex: { flex: 1 },
  self: { alignSelf: 'flex-start' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.ink },
  h2: { ...type.title, fontSize: 19, color: colors.ink },
  body: { ...type.body, color: colors.ink },
  small: { ...type.small, color: colors.slate },
  hint: { fontSize: 13, lineHeight: 18, color: colors.slate },
  link: { fontSize: 15, fontWeight: '700', color: colors.tealDark },
  label: { fontSize: 15, fontWeight: '800', color: colors.ink },
  req: { fontSize: 12, fontWeight: '800', color: colors.brick },
  opt: { fontSize: 12, fontWeight: '700', color: colors.slate },
  field: { gap: 8 },
  input: { minHeight: 50, borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: colors.white },
  inputErr: { borderColor: colors.brick, backgroundColor: colors.brickSoft },
  multi: { minHeight: 110, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontSize: 12, color: colors.slate },
  err: { fontSize: 13, fontWeight: '700', color: colors.brick },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 42, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center', backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.slate },
  chipTextOn: { color: colors.white },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  checkText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.ink },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  fileName: { flex: 1, fontSize: 14, color: colors.ink },
  nav: { flexDirection: 'row', gap: 10, marginTop: space.s },
  steps: { flexDirection: 'row', gap: 4, marginVertical: space.s },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  sn: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  snOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  snDone: { backgroundColor: colors.teal, borderColor: colors.teal },
  snText: { fontSize: 13, fontWeight: '800', color: colors.slate },
  sl: { fontSize: 11, lineHeight: 14, color: colors.slate, textAlign: 'center' },
  slOn: { fontWeight: '800', color: colors.ink },
  restored: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.leafSoft },
  panel: { padding: space.l, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, gap: 6 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dt: { fontSize: 12, fontWeight: '800', color: colors.slate, marginTop: 6 },
  dd: { ...type.body, color: colors.ink },
  privateBox: { marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: colors.amberSoft, gap: 4 },
  card: { borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', backgroundColor: colors.white },
  badges: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  cardBody: { padding: 14, gap: 6 },
  cardTitle: { ...type.cardTitle, color: colors.ink },
  success: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.leafSoft, alignItems: 'center', justifyContent: 'center' },
  ref: { fontSize: 24, fontWeight: '800', color: colors.tealDeep, letterSpacing: 1 },
});
