// The two lists of help tickets on the Impact page:
//  "Help requests"   (HelpRequests)  tickets neighbours opened on the person's own posts, where they are the organiser;
//  "My help tickets" (MyHelpTickets) tickets the person opened by offering help on other people's posts.
// Tap one to open it: status, activity thread and (for the organiser) a way to share contact details.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n';
import { ticketRef, useHelpRequests, useMyTickets, type Ticket } from '../state/requests';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';
import Icon from './Icon';
import { ViewAll, useCap } from './Capped';
import TicketSheet, { StatusPill } from './TicketSheet';

function Rows({ items, role, title, sub, empty }: { items: Ticket[]; role: 'owner' | 'helper'; title: string; sub: string; empty?: string }) {
  const { t, formatDate } = useT();
  const { user } = useStore();
  const [open, setOpen] = useState<Ticket | null>(null);
  const fresh = items.filter((x) => x.lastBy !== user?.uid && (x.status === 'requested' || x.status === 'accepted')).length;
  const cap = useCap(items, 3);
  if (!items.length && !empty) return null;
  return (
    <View style={styles.sec}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.h2}>{title}</Text>
        {fresh ? <View style={styles.count}><Text style={styles.countText}>{fresh}</Text></View> : null}
      </View>
      <Text style={styles.small}>{items.length ? sub : empty}</Text>
      {cap.shown.map((r) => {
        const theirs = r.lastBy !== user?.uid;
        return (
          <Pressable key={r.id} onPress={() => setOpen(r)} accessibilityRole="button" accessibilityLabel={r.postTitle} style={({ pressed }) => [styles.card, theirs && (r.status === 'requested' || r.status === 'accepted') && styles.cardNew, pressed && styles.pressed]}>
            <View style={styles.row}>
              <Text style={styles.ref}>{ticketRef(r.postId, r.helperUid)}</Text>
              <StatusPill status={r.status} />
            </View>
            <Text style={styles.name} numberOfLines={1}>{role === 'owner' ? (r.name || t('hr.someone')) : r.postTitle}</Text>
            <Text style={styles.small} numberOfLines={2}>{t(r.kind === 'volunteer' ? 'tk.qtyVol' : 'tk.qtyItems', { n: r.qty })} · {r.what}</Text>
            {role === 'owner' ? <Text style={styles.small} numberOfLines={1}>{t('hr.on', { p: r.postTitle })}</Text> : null}
            <View style={styles.row}>
              <Text style={styles.small}>{formatDate(new Date(r.lastAt || Date.now()).toISOString().slice(0, 10), { day: 'numeric', month: 'short' })}{theirs && r.lastText ? ` · ${r.lastText}` : ''}</Text>
              <Icon name="chev" size={18} color={colors.slate} />
            </View>
          </Pressable>
        );
      })}
      <ViewAll cap={cap} />
      {open ? <TicketSheet ticket={open} role={role} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

/** Tickets on the person's own posts. */
export default function HelpRequests() {
  const { t } = useT();
  const { user } = useStore();
  const { items } = useHelpRequests(user?.uid);
  return <Rows items={items} role="owner" title={t('hr.title')} sub={t('hr.sub')} />;
}

/** Tickets the person opened on other people's posts. */
export function MyHelpTickets() {
  const { t } = useT();
  const { user } = useStore();
  const { items } = useMyTickets(user?.uid);
  return <Rows items={items} role="helper" title={t('tk.mine')} sub={t('tk.mineSub')} empty={t('tk.mineNone')} />;
}

const styles = StyleSheet.create({
  sec: { paddingHorizontal: space.l, marginTop: space.l, gap: space.s },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  h2: { ...type.title, color: colors.ink },
  count: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: colors.heart, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { fontSize: 13, fontWeight: '800', color: colors.white },
  small: { ...type.small, color: colors.slate },
  card: { gap: 4, padding: space.m, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  cardNew: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  ref: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: colors.tealDeep },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
});
