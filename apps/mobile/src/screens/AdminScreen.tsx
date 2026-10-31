// Admin, as its own full screen (profile > Admin). English only (staff screen). Five tabs:
//   Overview  how the app is being used, with what needs attention at the top
//   Review    posts and organisations waiting for a decision, and reports
//   Live      posts that are live, with offers of help, payments and a take-down button
//   Money     monthly payments to confirm, totals and payouts
//   Setup     who receives monthly gifts, and the sample data for testing
// Firestore rules do the real checking; this screen only shows buttons.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AdminSip from '../components/AdminSip';
import { ViewAll, useCap } from '../components/Capped';
import { Orgs, PostCard, Reports, SampleData, postsBy } from '../components/AdminPanel';
import { NAV_HEIGHT } from '../components/BottomNav';
import Icon from '../components/Icon';
import { Button } from '../components/ui';
import { inr } from '../format';
import { useIsAdmin } from '../state/communities';
import { useMetrics } from '../state/metrics';
import { usePendingSipPayments } from '../state/sip';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme';

type Tab = 'overview' | 'review' | 'live' | 'money' | 'setup';

const CAUSES: [string, string, string][] = [
  ['medical', 'Medical', '#B4262C'], ['animals', 'Animals', '#A86A00'], ['education', 'Education', '#2E4BB8'], ['food', 'Food & hunger', '#C2570C'], ['environment', 'Environment', '#0B6B4F'],
];

function Bar({ label, value, max, color = colors.tealDark }: { label: string; value: number; max: number; color?: string }) {
  return (
    <View style={s.barRow}>
      <View style={s.barHead}><Text style={s.barLabel}>{label}</Text><Text style={s.barVal}>{value}</Text></View>
      <View style={s.track}><View style={[s.fill, { width: `${Math.max(value > 0 ? 3 : 0, Math.min(100, (value / Math.max(1, max)) * 100))}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function Tile({ n, label, tone = 'teal' }: { n: string | number; label: string; tone?: 'teal' | 'amber' | 'red' | 'green' }) {
  const bg = { teal: colors.tealDeep, amber: '#8A5300', red: colors.brick, green: colors.leaf }[tone];
  return <View style={[s.tile, { backgroundColor: bg }]}><Text style={s.tileN}>{n}</Text><Text style={s.tileL}>{label}</Text></View>;
}

function Mini({ n, label }: { n: string | number; label: string }) {
  return <View style={s.mini}><Text style={s.miniN}>{n}</Text><Text style={s.miniL}>{label}</Text></View>;
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { back, user } = useStore();
  const isAdmin = useIsAdmin(user?.uid);
  const [tab, setTab] = useState<Tab>('overview');
  const [tick, setTick] = useState(0);
  const { m, top, failed, at } = useMetrics(tick);
  const pending = postsBy('pending');
  const live = postsBy('approved');
  const payments = usePendingSipPayments();
  const capPending = useCap(pending, 3);
  const capLive = useCap(live, 4);
  const capTop = useCap(top, 3);

  const v = (k: string): number => m?.[k] ?? 0;
  const dash = (k: string): string | number => (m?.[k] === undefined ? '—' : m[k]!);
  const totalPosts = Math.max(1, v('posts'));
  const attention = [
    { label: 'Posts to review', n: pending.length, tab: 'review' as Tab, tone: 'amber' as const },
    { label: 'Organisations to verify', n: v('orgsPending'), tab: 'review' as Tab, tone: 'amber' as const },
    { label: 'Reports to read', n: v('reports'), tab: 'review' as Tab, tone: 'red' as const },
    { label: 'Monthly payments to confirm', n: payments.length, tab: 'money' as Tab, tone: 'amber' as const },
  ];
  const tabs: [Tab, string, number][] = [['overview', 'Overview', 0], ['review', 'Review', pending.length + v('orgsPending') + v('reports')], ['live', 'Live', 0], ['money', 'Money', payments.length], ['setup', 'Setup', 0]];

  return (
    <View style={s.screen}>
      <View style={s.bar}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={s.backBtn}><Icon name="back" size={22} color={colors.ink} /></Pressable>
        <View style={s.grow}>
          <Text style={s.h1}>Admin</Text>
          <Text style={s.sub}>{at ? `Updated ${new Date(at).toLocaleTimeString()}` : 'Loading…'}</Text>
        </View>
        <Button label="Refresh" small variant="ghost" onPress={() => setTick((x) => x + 1)} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsWrap} contentContainerStyle={s.tabs}>
        {tabs.map(([id, label, n]) => (
          <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} style={[s.tab, tab === id && s.tabOn]}>
            <Text style={[s.tabText, tab === id && s.tabTextOn]}>{label}</Text>
            {n > 0 ? <View style={s.badge}><Text style={s.badgeText}>{n}</Text></View> : null}
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={[s.body, { paddingBottom: NAV_HEIGHT + insets.bottom + space.xxl }]} showsVerticalScrollIndicator={false}>
        {!isAdmin ? <Text style={s.hint}>This screen is for admins only. If you should have access, add your account under admins in the database.</Text> : null}
        {failed.length ? <Text style={s.warn}>Could not count: {failed.join(', ')}. Publish the latest Firestore rules and check your connection.</Text> : null}

        {tab === 'overview' ? (
          <>
            <Card title="Needs your attention">
              <View style={s.grid}>
                {attention.map((a) => (
                  <Pressable key={a.label} onPress={() => setTab(a.tab)} accessibilityRole="button" style={[s.attn, a.n > 0 && (a.tone === 'red' ? s.attnRed : s.attnAmber)]}>
                    <Text style={[s.attnN, a.n > 0 && { color: a.tone === 'red' ? colors.brick : '#8A5300' }]}>{a.n}</Text>
                    <Text style={s.attnL}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
              {attention.every((a) => a.n === 0) ? <Text style={s.hint}>All clear. Nothing is waiting for you.</Text> : null}
            </Card>

            <View style={s.grid}>
              <Tile n={dash('users')} label="People using the app" />
              <Tile n={dash('active7')} label="Active this week" tone="green" />
              <Tile n={dash('posts')} label="Posts shared" />
              <Tile n={dash('helps')} label="Offers of help" tone="green" />
            </View>

            <Card title="Growth" hint="New accounts and people who opened the app">
              <View style={s.table}>
                <View style={s.tr}><Text style={[s.th, s.grow]} /><Text style={s.th}>Today</Text><Text style={s.th}>7 days</Text><Text style={s.th}>30 days</Text></View>
                <View style={s.tr}><Text style={[s.td, s.grow]}>New accounts</Text><Text style={s.tdv}>{dash('usersToday')}</Text><Text style={s.tdv}>{dash('users7')}</Text><Text style={s.tdv}>{dash('users30')}</Text></View>
                <View style={s.tr}><Text style={[s.td, s.grow]}>Opened the app</Text><Text style={s.tdv}>{dash('activeToday')}</Text><Text style={s.tdv}>{dash('active7')}</Text><Text style={s.tdv}>{dash('active30')}</Text></View>
              </View>
            </Card>

            <Card title="What people did" hint="Of everyone with an account. Counts start when each person first does it in this version.">
              <Bar label="Posted" value={v('posted')} max={v('users')} />
              <Bar label="Offered help" value={v('helped')} max={v('users')} color={colors.leaf} />
              <Bar label="Donated" value={v('gave')} max={v('users')} color="#C2570C" />
              <Bar label="Joined a community" value={v('inCommunity')} max={v('users')} color="#5B21B6" />
            </Card>

            <Card title="Posts">
              <View style={s.stack}>
                <View style={[s.seg, { flex: Math.max(v('approved'), 0.001), backgroundColor: colors.leaf }]} />
                <View style={[s.seg, { flex: Math.max(v('pending'), 0.001), backgroundColor: '#E0A800' }]} />
                <View style={[s.seg, { flex: Math.max(v('rejected'), 0.001), backgroundColor: colors.brick }]} />
              </View>
              <View style={s.legend}>
                <Text style={s.leg}><Text style={{ color: colors.leaf }}>●</Text> Live {dash('approved')}</Text>
                <Text style={s.leg}><Text style={{ color: '#E0A800' }}>●</Text> Waiting {dash('pending')}</Text>
                <Text style={s.leg}><Text style={{ color: colors.brick }}>●</Text> Rejected {dash('rejected')}</Text>
              </View>
              <View style={s.miniRow}>
                <Mini n={dash('problems')} label="Problems" />
                <Mini n={dash('projects')} label="Projects" />
                <Mini n={dash('funds')} label="Fundraisers" />
              </View>
              <View style={s.miniRow}>
                <Mini n={dash('postsToday')} label="Today" />
                <Mini n={dash('posts7')} label="This week" />
                <Mini n={dash('samples')} label="Samples" />
              </View>
            </Card>

            <Card title="Posts by cause">
              {CAUSES.map(([id, label, color]) => <Bar key={id} label={label} value={v(`cause_${id}`)} max={totalPosts} color={color} />)}
            </Card>

            <Card title="Help and money" hint="Money is counted only after an organiser or admin confirmed it arrived">
              <View style={s.miniRow}>
                <Mini n={dash('helps')} label="Offers of help" />
                <Mini n={dash('donations')} label="Payments reported" />
                <Mini n={dash('donors')} label="Confirmed" />
              </View>
              <View style={s.moneyRow}><Text style={s.moneyL}>Money confirmed received</Text><Text style={s.moneyN}>{m?.money === undefined ? '—' : inr(m.money)}</Text></View>
            </Card>

            <Card title="Monthly giving">
              <View style={s.miniRow}>
                <Mini n={dash('sipActive')} label="Active gifts" />
                <Mini n={m?.sipCharges !== undefined && m?.sipPaid !== undefined ? m.sipCharges + m.sipPaid : '—'} label="Payments confirmed" />
                <Mini n={m?.sipCollected === undefined ? '—' : inr(m.sipCollected)} label="Collected" />
              </View>
            </Card>

            <Card title="Communities">
              <View style={s.miniRow}>
                <Mini n={dash('communities')} label="Communities" />
                <Mini n={dash('members')} label="Joins" />
                <Mini n={dash('orgsVerified')} label="Verified orgs" />
              </View>
              {top.length ? capTop.shown.map((c) => <Bar key={c.id} label={c.name} value={c.members} max={top[0].members} color="#5B21B6" />) : null}
              <ViewAll cap={capTop} en />
            </Card>
          </>
        ) : null}

        {tab === 'review' ? (
          <>
            <Text style={s.h2}>Posts to review ({pending.length})</Text>
            {pending.length ? capPending.shown.map((p) => <PostCard key={p.id} p={p} review others={[...pending, ...live]} />) : <Text style={s.empty}>Nothing waiting. Nice work.</Text>}
            <ViewAll cap={capPending} en />
            <Orgs />
            <Reports />
          </>
        ) : null}

        {tab === 'live' ? (
          <>
            <Text style={s.h2}>Live posts ({live.length})</Text>
            {live.length ? capLive.shown.map((p) => <PostCard key={p.id} p={p} review={false} others={[...pending, ...live]} />) : <Text style={s.empty}>No live posts yet. Approve one from Review, or add samples in Setup.</Text>}
            <ViewAll cap={capLive} en />
          </>
        ) : null}

        {tab === 'money' ? <AdminSip part="money" /> : null}

        {tab === 'setup' ? (
          <>
            <AdminSip part="settings" />
            <SampleData />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.s, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line },
  backBtn: { padding: 6 },
  grow: { flex: 1 },
  h1: { fontSize: 22, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.slate },
  tabsWrap: { flexGrow: 0, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line },
  tabs: { paddingHorizontal: space.l, paddingVertical: space.s, gap: space.s },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  tabOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.slate },
  tabTextOn: { color: colors.white },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.heart, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { fontSize: 11, fontWeight: '800', color: colors.white },
  body: { padding: space.l, gap: space.m },
  h2: { fontSize: 18, fontWeight: '800', color: colors.ink },
  empty: { fontSize: 14, color: colors.slate, paddingVertical: space.m },
  hint: { fontSize: 13, color: colors.slate },
  warn: { fontSize: 13, color: colors.brick },
  card: { gap: space.s, padding: space.m, borderRadius: radius.m, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  tile: { width: '48%', flexGrow: 1, padding: space.m, borderRadius: radius.m },
  tileN: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.white },
  tileL: { fontSize: 12, color: '#DFF3F2' },
  attn: { width: '48%', flexGrow: 1, padding: space.m, borderRadius: radius.m, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.paper },
  attnAmber: { borderColor: '#E0A800', backgroundColor: '#FFF8E1' },
  attnRed: { borderColor: colors.brick, backgroundColor: colors.brickSoft },
  attnN: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.ink },
  attnL: { fontSize: 12, color: colors.slate },
  table: { gap: 2 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  th: { width: 64, textAlign: 'right', fontSize: 12, fontWeight: '700', color: colors.slate },
  td: { fontSize: 14, color: colors.ink },
  tdv: { width: 64, textAlign: 'right', fontSize: 16, fontWeight: '800', color: colors.ink },
  barRow: { gap: 4 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space.s },
  barLabel: { flex: 1, fontSize: 14, color: colors.ink },
  barVal: { fontSize: 14, fontWeight: '800', color: colors.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.greySoft, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  stack: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 },
  seg: { height: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m },
  leg: { fontSize: 13, color: colors.slate },
  miniRow: { flexDirection: 'row', gap: space.s },
  mini: { flex: 1, paddingVertical: space.s, borderRadius: radius.s, backgroundColor: colors.tealSoft, alignItems: 'center' },
  miniN: { fontSize: 20, fontWeight: '800', color: colors.tealDeep },
  miniL: { fontSize: 11, color: colors.tealDeep, textAlign: 'center', paddingHorizontal: 4 },
  moneyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.s },
  moneyL: { fontSize: 14, color: colors.slate },
  moneyN: { fontSize: 22, fontWeight: '800', color: colors.leaf },
});
