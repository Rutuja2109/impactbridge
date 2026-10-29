import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_HEIGHT } from '../components/BottomNav';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import { Badge, Button, Notice, PageHead } from '../components/ui';
import { firebaseReady } from '../firebase';
import { useT } from '../i18n';
import { report } from '../state/posts';
import { WHATSAPP_RE, applyOrg, createCommunity, setJoined, useCommunities, useIsAdmin, useJoined, useMembers, useOrg, type Community } from '../state/communities';
import { useStore } from '../state/store';
import { colors, radius, shadow, space, type } from '../theme';

const ID = 'community'; // demo-mode community (no Firebase); joining it earns the "Community member" badge
const MEMBERS = 1240; // sample figure

export default function CommunityScreen() {
  return firebaseReady ? <LiveCommunities /> : <DemoCommunity />;
}

// Without Firebase keys (Expo Go, development): one local "Join community" card, as before.
function DemoCommunity() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { following, toggle, toast } = useStore();
  const on = following.includes(ID);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: NAV_HEIGHT + insets.bottom + space.xxl }}>
      <PageHead title={t('comm.title')} subtitle={t('comm.sub')} tag={t('c.sampleData')} />
      <View style={styles.card}>
        <View style={styles.icon}><Icon name="people" size={36} color={colors.tealDark} /></View>
        <Text style={styles.title}>{t('n.cName')}</Text>
        <Text style={styles.desc}>{t('n.cDesc')}</Text>
        <Text style={styles.members}>{t('n.cMembers', { n: (MEMBERS + (on ? 1 : 0)).toLocaleString('en-IN') })}</Text>
        <Button label={on ? t('n.cJoined') : t('n.cJoin')} variant={on ? 'on' : 'primary'} block icon={on ? 'check' : undefined} onPress={() => toast(t(toggle('following', ID) ? 'n.cToastJoin' : 'n.cToastLeave'))} />
      </View>
    </ScrollView>
  );
}

// With Firebase: every community started by a verified organisation. People join; the organisation that posted it
// is told (push + in-app) and can see who joined. Only verified organisations get the "Create a community" button.
function LiveCommunities() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { user, toast } = useStore();
  const list = useCommunities();
  const org = useOrg(user?.uid);
  const joined = useJoined(user?.uid);
  const isAdmin = useIsAdmin(user?.uid);
  const openGroup = (c: Community) => Linking.openURL(c.whatsapp).catch(() => toast(t('n.cm.waFail')));
  const { setFollowing } = useStore();
  useEffect(() => { setFollowing(joined); }, [joined.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState<'apply' | 'create' | null>(null);
  const [seeing, setSeeing] = useState<Community | null>(null);

  const join = async (c: Community) => {
    if (!user?.uid) { toast(t('n.cm.signin')); return; }
    const on = !joined.includes(c.id);
    try {
      await setJoined(user, c.id, on);
      toast(t(on ? 'n.cm.joinedToast' : 'n.cToastLeave'));
      if (on && c.whatsapp) openGroup(c); // joining takes you straight into the official WhatsApp group
    } catch { toast(t('n.cm.fail')); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: NAV_HEIGHT + insets.bottom + space.xxl }}>
      <PageHead title={t('comm.title')} subtitle={t('n.cm.sub')} />

      <View style={styles.card}>
        {isAdmin && !org?.verified ? (
          <>
            <Badge label={t('n.cm.admin')} tone="leaf" icon="check" />
            <Button label={t('n.cm.create')} block onPress={() => setForm('create')} />
          </>
        ) : org?.verified ? (
          <>
            <Badge label={t('n.cm.verified')} tone="leaf" icon="check" />
            <Text style={styles.title}>{org.orgName}</Text>
            <Button label={t('n.cm.create')} block onPress={() => setForm('create')} />
          </>
        ) : org ? (
          <>
            <Badge label={t(org.status === 'rejected' ? 'n.cm.rejected' : 'n.cm.pending')} tone="amber" />
            <Text style={styles.desc}>{t(org.status === 'rejected' ? 'n.cm.rejectedD' : 'n.cm.pendingD')}</Text>
          </>
        ) : (
          <>
            <View style={styles.icon}><Icon name="people" size={36} color={colors.tealDark} /></View>
            <Text style={styles.title}>{t('n.cm.apply')}</Text>
            <Text style={styles.desc}>{t('n.cm.applyD')}</Text>
            <Button label={t('n.cm.applyBtn')} block variant="ghost" onPress={() => (user?.uid ? setForm('apply') : toast(t('n.cm.signin')))} />
          </>
        )}
      </View>

      {list.length ? list.map((c) => {
        const on = joined.includes(c.id);
        const mine = c.ownerId === user?.uid;
        return (
          <View key={c.id} style={styles.card}>
            <Text style={styles.title}>{c.name}</Text>
            <View style={styles.row}><Badge label={t('n.cm.verified')} tone="leaf" icon="check" /><Text style={styles.small}>{t('n.cm.by', { o: c.orgName })}{c.city ? ` · ${c.city}` : ''}</Text></View>
            <Text style={styles.desc}>{c.desc}</Text>
            <Text style={styles.members}>{t('n.cm.members', { n: (c.memberCount ?? 0).toLocaleString('en-IN') })}</Text>
            {mine ? <Button label={t('n.cm.seeMembers')} block variant="ghost" onPress={() => setSeeing(c)} />
              : on ? (
                <>
                  <Button label={t('n.cm.openWa')} block icon="check" onPress={() => openGroup(c)} />
                  <Button label={t('n.cm.leave')} variant="ghost" small onPress={() => join(c)} />
                </>
              ) : <Button label={t('n.cm.joinWa')} block onPress={() => join(c)} />}
            {mine || !user?.uid ? null : <Button label={t('b.report')} variant="ghost" small onPress={() => report(user, 'community', c.id, 'reported from app').then(() => toast(t('t.reported'))).catch(() => toast(t('n.cm.fail')))} />}
          </View>
        );
      }) : <Text style={[styles.small, styles.none]}>{t('n.cm.none')}</Text>}

      {form === 'apply' && user ? <ApplySheet onClose={() => setForm(null)} /> : null}
      {form === 'create' && user && (org || isAdmin) ? <CreateSheet orgName={org?.orgName ?? 'GoodNeighbour'} onClose={() => setForm(null)} /> : null}
      {seeing ? <MembersSheet c={seeing} onClose={() => setSeeing(null)} /> : null}
    </ScrollView>
  );
}

function useForm<K extends string>(keys: K[]) {
  const [v, setV] = useState<Record<K, string>>(Object.fromEntries(keys.map((k) => [k, ''])) as Record<K, string>);
  return [v, (k: K) => (s: string) => setV((o) => ({ ...o, [k]: s })), keys.every((k) => v[k].trim().length > 1)] as const;
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (s: string) => void; multiline?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} multiline={multiline} style={[styles.input, multiline && styles.multi]} accessibilityLabel={label} />
    </View>
  );
}

function ApplySheet({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const { user, toast } = useStore();
  const [v, set, ok] = useForm(['orgName', 'kind', 'regNo', 'contact']);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!ok) { toast(t('n.cm.err')); return; }
    setBusy(true);
    try { await applyOrg(user!, v); toast(t('n.cm.applied')); onClose(); } catch { toast(t('n.cm.fail')); setBusy(false); }
  };
  return (
    <Sheet visible onClose={onClose} title={t('n.cm.applyBtn')} subtitle={t('n.cm.applyD')}>
      <Field label={t('n.cm.orgName')} value={v.orgName} onChange={set('orgName')} />
      <Field label={t('n.cm.orgType')} value={v.kind} onChange={set('kind')} />
      <Field label={t('n.cm.regNo')} value={v.regNo} onChange={set('regNo')} />
      <Field label={t('n.cm.contact')} value={v.contact} onChange={set('contact')} />
      <Notice tone="blue" text={t('n.cm.reviewNote')} />
      <Button label={t('n.cm.submit')} block onPress={submit} disabled={busy} />
    </Sheet>
  );
}

function CreateSheet({ orgName, onClose }: { orgName: string; onClose: () => void }) {
  const { t } = useT();
  const { user, toast } = useStore();
  const [v, set, ok] = useForm(['name', 'desc', 'city', 'whatsapp']);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!ok) { toast(t('n.cm.err')); return; }
    if (!WHATSAPP_RE.test(v.whatsapp.trim())) { toast(t('n.cm.waBad')); return; }
    setBusy(true);
    try { await createCommunity(user!, orgName, { ...v, whatsapp: v.whatsapp.trim() }); toast(t('n.cm.created')); onClose(); } catch { toast(t('n.cm.fail')); setBusy(false); }
  };
  return (
    <Sheet visible onClose={onClose} title={t('n.cm.create')}>
      <Field label={t('n.cm.cName')} value={v.name} onChange={set('name')} />
      <Field label={t('n.cm.cDesc')} value={v.desc} onChange={set('desc')} multiline />
      <Field label={t('n.cm.city')} value={v.city} onChange={set('city')} />
      <Field label={t('n.cm.waLink')} value={v.whatsapp} onChange={set('whatsapp')} />
      <Text style={styles.small}>{t('n.cm.waHelp')}</Text>
      <Button label={t('n.cm.submit')} block onPress={submit} disabled={busy} />
    </Sheet>
  );
}

function MembersSheet({ c, onClose }: { c: Community; onClose: () => void }) {
  const { t } = useT();
  const { user } = useStore();
  const members = useMembers(c.id, user?.uid);
  return (
    <Sheet visible onClose={onClose} title={c.name} subtitle={t('n.cm.members', { n: members.length })}>
      {members.length ? members.map((m) => <Text key={m.uid} style={styles.member}>{m.name}</Text>) : <Text style={styles.small}>{t('n.cm.noMembers')}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  card: { marginHorizontal: space.l, marginTop: space.xl, padding: space.xl, gap: space.m, alignItems: 'center', borderRadius: radius.l, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, boxShadow: shadow.card },
  icon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.title, color: colors.ink, textAlign: 'center' },
  desc: { ...type.body, color: colors.slate, textAlign: 'center' },
  small: { ...type.small, color: colors.slate, textAlign: 'center' },
  none: { marginTop: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  members: { fontSize: 16, fontWeight: '800', color: colors.tealDark },
  field: { gap: 6, marginBottom: space.s },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.m, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, color: colors.ink, backgroundColor: colors.white },
  multi: { minHeight: 96, textAlignVertical: 'top' },
  member: { ...type.body, color: colors.ink, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
});
