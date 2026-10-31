// One help ticket, opened by either person. Shows the status (change it with the buttons your role allows), what is being offered, the
// activity thread where both can write, and for the organiser a one-tap way to share contact details. Statuses and activity update live
// for both people.
import { collection, doc, getDoc } from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';

import { db } from '../firebase';
import { useT } from '../i18n';
import { HELPER_MOVES, OWNER_MOVES, STATUS, addActivity, markRequestsSeen, moveTicket, ticketRef, useActivity, useTicket, type Ticket, type TicketStatus } from '../state/requests';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';
import Sheet from './Sheet';
import { Button } from './ui';

const TONE = {
  blue: { bg: '#DCE6FF', fg: '#2A3F8F' },
  green: { bg: colors.leafSoft, fg: colors.leaf },
  red: { bg: colors.brickSoft, fg: colors.brick },
  grey: { bg: colors.greySoft, fg: colors.grey },
} as const;

/** The coloured status "lozenge", as in an issue tracker. */
export function StatusPill({ status }: { status: TicketStatus }) {
  const { t } = useT();
  const tone = TONE[STATUS[status].tone];
  return <Text style={[styles.pill, { backgroundColor: tone.bg, color: tone.fg }]}>{t(STATUS[status].key).toUpperCase()}</Text>;
}

export default function TicketSheet({ ticket, role, onClose }: { ticket: Ticket; role: 'owner' | 'helper'; onClose: () => void }) {
  const { t, formatDate } = useT();
  const { user, toast } = useStore();
  const tk = useTicket(ticket);
  const activity = useActivity(tk);
  const [text, setText] = useState('');
  const [allAct, setAllAct] = useState(false);
  const [asContact, setAsContact] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { markRequestsSeen(); }, [tk.lastAt]);

  const moves = (role === 'owner' ? OWNER_MOVES : HELPER_MOVES)[tk.status];
  const who = role === 'owner' ? tk.name : tk.ownerName;
  const when = (ms: number) => `${formatDate(new Date(ms || Date.now()).toISOString().slice(0, 10), { day: 'numeric', month: 'short' })} ${new Date(ms || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const move = (to: TicketStatus) => {
    if (!user?.uid) return;
    setBusy(true);
    moveTicket(user, tk, to).catch(() => toast(t('n.cm.fail'))).finally(() => setBusy(false));
  };
  const send = () => {
    if (!user?.uid || !text.trim()) return;
    setBusy(true);
    addActivity(user, tk, asContact ? 'contact' : 'comment', text.trim())
      .then(() => { setText(''); setAsContact(false); })
      .catch(() => toast(t('n.cm.fail')))
      .finally(() => setBusy(false));
  };
  // The organiser's contact is the private contact they gave when posting; it is filled in so they can edit it before sending.
  const shareContact = () => {
    getDoc(doc(db!, 'posts', tk.postId, 'private', 'info'))
      .then((s) => {
        const c = String(s.data()?.private ?? user?.email ?? '');
        setText(t('tk.contactLine', { n: user?.name ?? '', c }));
        setAsContact(true);
      })
      .catch(() => { setText(t('tk.contactLine', { n: user?.name ?? '', c: user?.email ?? '' })); setAsContact(true); });
  };

  return (
    <Sheet visible onClose={onClose} title={ticketRef(tk.postId, tk.helperUid)} subtitle={tk.postTitle}>
      <View style={styles.row}>
        <StatusPill status={tk.status} />
        <Text style={styles.small}>{t('tk.updated', { d: when(tk.statusAt) })}</Text>
      </View>
      {moves.length ? (
        <View style={styles.moves}>
          {moves.map((m) => <View key={m} style={styles.flex}><Button label={t(`tk.mv.${m}`)} small block variant={m === 'accepted' || m === 'completed' ? 'primary' : 'ghost'} disabled={busy} onPress={() => move(m)} /></View>)}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.h}>{t(tk.kind === 'volunteer' ? 'tk.volunteer' : 'tk.items')}</Text>
        <Text style={styles.line}>{t(tk.kind === 'volunteer' ? 'tk.qtyVol' : 'tk.qtyItems', { n: tk.qty })}{tk.hours ? ` · ${t('tk.hours', { n: tk.hours })}` : ''}</Text>
        <Text style={styles.line}>{tk.what}</Text>
        {tk.when ? <Text style={styles.small}>{t('tk.when', { w: tk.when })}</Text> : null}
        <Text style={styles.small}>{role === 'owner' ? t('tk.from', { n: tk.name }) : t('tk.to', { n: tk.ownerName || t('ho.organiser') })}</Text>
        {role === 'owner' ? (
          <View style={styles.reach}>
            {tk.email ? <Text style={styles.link} onPress={() => { Linking.openURL(`mailto:${tk.email}?subject=${encodeURIComponent(tk.postTitle)}`).catch(() => undefined); }}>{tk.email}</Text> : null}
            {tk.phone ? <Text style={styles.link} onPress={() => { Linking.openURL(`tel:${tk.phone}`).catch(() => undefined); }}>{tk.phone}</Text> : null}
          </View>
        ) : null}
      </View>

      <Text style={styles.h}>{t('tk.activity')}</Text>
      {activity.length > 5 && !allAct ? <Text style={styles.earlier} onPress={() => setAllAct(true)} accessibilityRole="button">{t('tk.earlier', { n: activity.length - 5 })}</Text> : null}
      {(allAct ? activity : activity.slice(-5)).map((a) => {
        const mine = a.by === user?.uid;
        if (a.type === 'status') {
          return <Text key={a.id} style={styles.event}>{a.from ? t('tk.moved', { n: mine ? t('tk.you') : a.byName || who, f: t(STATUS[a.from as TicketStatus]?.key ?? 'tk.st.requested'), s: t(STATUS[a.to as TicketStatus]?.key ?? 'tk.st.requested') }) : t('tk.opened', { n: mine ? t('tk.you') : a.byName || who })} · {when(a.at)}</Text>;
        }
        return (
          <View key={a.id} style={[styles.bubble, mine ? styles.mine : styles.theirs, a.type === 'contact' && styles.contact]}>
            <Text style={styles.by}>{mine ? t('tk.you') : a.byName || who}{a.type === 'contact' ? ` · ${t('tk.contactShared')}` : ''}</Text>
            <Text style={styles.msg}>{a.text}</Text>
            <Text style={styles.at}>{when(a.at)}</Text>
          </View>
        );
      })}
      {!activity.length ? <Text style={styles.small}>{t('tk.noActivity')}</Text> : null}

      {tk.status === 'declined' || tk.status === 'withdrawn' || tk.status === 'completed' ? <Text style={styles.small}>{t('tk.closed')}</Text> : null}
      <TextInput
        value={text}
        onChangeText={(v) => { setText(v); if (!v) setAsContact(false); }}
        placeholder={t(role === 'owner' ? 'tk.writeOwner' : 'tk.writeHelper')}
        placeholderTextColor={colors.slate}
        multiline
        maxLength={600}
        accessibilityLabel={t('tk.write')}
        style={styles.input}
      />
      <View style={styles.moves}>
        {role === 'owner' ? <View style={styles.flex}><Button label={t('tk.shareContact')} small block variant="ghost" onPress={shareContact} /></View> : null}
        <View style={styles.flex}><Button label={t('tk.send')} small block disabled={busy || !text.trim()} onPress={send} /></View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexWrap: 'wrap' },
  moves: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 120 },
  small: { ...type.small, color: colors.slate },
  card: { gap: 4, padding: space.m, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  h: { fontSize: 15, fontWeight: '800', color: colors.ink },
  line: { ...type.body, color: colors.ink },
  reach: { gap: 2, marginTop: 4 },
  link: { fontSize: 15, fontWeight: '700', color: colors.tealDark },
  earlier: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.tealSoft, fontSize: 13, fontWeight: '800', color: colors.tealDark, overflow: 'hidden' },
  event: { fontSize: 12, color: colors.slate, textAlign: 'center' },
  bubble: { gap: 2, padding: space.m, borderRadius: radius.m, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.tealSoft },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.greySoft },
  contact: { borderWidth: 1.5, borderColor: colors.teal },
  by: { fontSize: 12, fontWeight: '800', color: colors.tealDeep },
  msg: { fontSize: 15, lineHeight: 21, color: colors.ink },
  at: { fontSize: 11, color: colors.slate },
  input: { minHeight: 70, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.m, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink, backgroundColor: colors.white, textAlignVertical: 'top' },
});
