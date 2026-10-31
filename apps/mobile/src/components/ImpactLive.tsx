// Impact page for the installed app: the person's level and points, what they did, their posts (tap one to see it, even while it
// waits for review), their giving with the organiser's confirmation, tiered badges and certificates. Everything is read live
// from their account, and any badge or certificate can be shared as a picture.
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View, findNodeHandle } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { inr } from '../format';
import { useT } from '../i18n';
import { TIER_COLOR, TIER_SOFT, certNo, liveStats, type LiveBadge, type LiveCert, type Tier } from '../state/achievements';
import { useJoined } from '../state/communities';
import { useMyGives, type Give } from '../state/donations';
import { useMyHelps, useMyPosts, type MyPost } from '../state/mine';
import { markRequestsSeen, useHelpRequests, useMyTickets } from '../state/requests';
import { stopSip, useMySips } from '../state/sip';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';
import HelpRequests, { MyHelpTickets } from './HelpRequests';
import Icon, { type IconName } from './Icon';
import { ViewAll, useCap } from './Capped';
import { LogoMark } from './Logo';
import MyPostSheet from './MyPostSheet';
import Sheet from './Sheet';
import { Badge as Pill, Button } from './ui';

const iso = (ms: number) => new Date(ms || Date.now()).toISOString().slice(0, 10);
const LEVEL_ICON: IconName[] = ['people', 'heart', 'hand', 'check', 'chart'];
const BADGE_ICON: Record<string, IconName> = { voice: 'heart', trusted: 'check', helper: 'hand', giver: 'coin', generous: 'chart', builder: 'people', allround: 'bell' };

/** Turns a view into a picture and opens the phone's share sheet (WhatsApp, Instagram, Gmail ...). Falls back to plain text. */
async function shareView(node: ComponentRef<typeof View> | null, text: string) {
  try {
    const handle = node ? findNodeHandle(node) : null;
    if (handle && (await Sharing.isAvailableAsync())) {
      const uri = await captureRef(handle, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: text });
      return;
    }
  } catch { /* fall through to text */ }
  await Share.share({ message: text }).catch(() => undefined);
}

/** A round medal in the colour of its tier (grey when not earned). */
function Medal({ icon, tier, size = 46 }: { icon: IconName; tier: Tier; size?: number }) {
  return (
    <View style={[styles.medal, { width: size, height: size, borderRadius: size / 2, borderColor: TIER_COLOR[tier], backgroundColor: tier ? colors.tealDark : colors.greySoft }]}>
      <Icon name={icon} size={Math.round(size * 0.48)} color={tier ? colors.white : colors.slate} />
    </View>
  );
}

function Bar({ value, total }: { value: number; total: number }) {
  return <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.max(4, Math.min(100, (value / Math.max(1, total)) * 100))}%` }]} /></View>;
}

function BadgeCard({ b, who }: { b: LiveBadge; who: string }) {
  const { t } = useT();
  return (
    <View style={[styles.shareCard, { borderColor: TIER_COLOR[b.tier], backgroundColor: TIER_SOFT[b.tier] }]} collapsable={false}>
      <LogoMark size={40} />
      <Medal icon={b.icon} tier={b.tier} size={104} />
      <View style={[styles.tierChip, { backgroundColor: TIER_COLOR[b.tier] }]}><Text style={styles.tierChipText}>{t(`tier.${b.tier}`).toUpperCase()}</Text></View>
      <Text style={styles.bcTitle}>{t(`ab.${b.id}`)}</Text>
      <Text style={styles.bcWho}>{who}</Text>
      <Text style={styles.small}>{t(`ab.${b.id}D`)}</Text>
      <Text style={styles.bcTag}>GoodNeighbour · {t('home.tagline')}</Text>
    </View>
  );
}

function CertCard({ cert, who, uid }: { cert: LiveCert; who: string; uid?: string }) {
  const { t, formatDate } = useT();
  const tier: Tier = cert.kind === 'tier' ? cert.tier : cert.kind === 'gift' ? 3 : (Math.min(3, Math.max(1, cert.level - 1)) as Tier);
  const title = t(cert.kind === 'tier' ? 'ct.t.tier' : cert.kind === 'gift' ? 'ct.t.gift' : 'ct.t.level');
  const body = cert.kind === 'tier' ? t('ct.b.tier', { tier: t(`tier.${cert.tier}`), b: t(`ab.${cert.badge}`), d: t(`ab.${cert.badge}D`) })
    : cert.kind === 'gift' ? t('ct.b.gift', { a: inr(cert.amount), c: cert.title })
      : t('ct.b.level', { l: t(`lvl.${cert.level}`), p: cert.points });
  const icon: IconName = cert.kind === 'tier' ? BADGE_ICON[cert.badge] ?? 'heart' : cert.kind === 'gift' ? 'coin' : LEVEL_ICON[cert.level];
  return (
    <View style={[styles.cert, { borderColor: TIER_COLOR[tier] }]} collapsable={false}>
      <View style={[styles.certInner, { borderColor: TIER_COLOR[tier] }]}>
        <LogoMark size={52} />
        <Text style={styles.certKicker}>GOODNEIGHBOUR</Text>
        <Text style={styles.certTitle}>{title}</Text>
        <View style={[styles.certRule, { backgroundColor: TIER_COLOR[tier] }]} />
        <Text style={styles.small}>{t('n.certTo')}</Text>
        <Text style={styles.certName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{who}</Text>
        <Medal icon={icon} tier={tier} size={64} />
        <Text style={styles.certBody}>{body}</Text>
        <View style={styles.certFoot}>
          <View style={styles.certCol}>
            <Text style={styles.certSign}>{t('ct.sign')}</Text>
            <View style={styles.certLine} />
            <Text style={styles.certTiny}>{t('ct.issued', { d: formatDate(iso(cert.at), { day: 'numeric', month: 'long', year: 'numeric' }) })}</Text>
          </View>
          <View style={styles.certCol}>
            <Text style={styles.certNo}>{certNo(uid, cert.id)}</Text>
            <View style={styles.certLine} />
            <Text style={styles.certTiny}>{t('ct.no')}</Text>
          </View>
        </View>
        <Text style={styles.certNote}>{t('n.cert.note')}</Text>
      </View>
    </View>
  );
}

type Tab = 'overview' | 'help' | 'giving' | 'badges';
type Shown = { kind: 'badge'; badge: LiveBadge } | { kind: 'cert'; cert: LiveCert } | null;

const certName = (c: LiveCert, t: (k: string, v?: Record<string, string | number>) => string) =>
  c.kind === 'tier' ? `${t(`ab.${c.badge}`)} · ${t(`tier.${c.tier}`)}` : c.kind === 'gift' ? c.title : `${t('lvl.label', { n: c.level })} · ${t(`lvl.${c.level}`)}`;

export default function ImpactLive() {
  const { t, formatDate } = useT();
  const store = useStore();
  const uid = store.user?.uid;
  const who = store.user?.name || t('n.guest');
  const posts = useMyPosts(uid);
  const helps = useMyHelps(uid);
  const gives = useMyGives(uid);
  const joined = useJoined(uid);
  const sips = useMySips(uid).filter((x) => x.status !== 'created');
  const [shown, setShown] = useState<Shown>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const capPosts = useCap(posts, 3);
  const capSips = useCap(sips, 3);
  const capGives = useCap(gives, 3);
  const [open, setOpen] = useState<MyPost | null>(null);
  const card = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => { markRequestsSeen(); }, []);
  const s = liveStats({ posts, helps, joined: joined.length, gives });
  const capBadges = useCap(s.badges, 4);
  const capCerts = useCap(s.certs, 3);
  const share = () => {
    if (!shown) return;
    const label = shown.kind === 'badge' ? `${t(`ab.${shown.badge.id}`)} · ${t(`tier.${shown.badge.tier}`)}` : t(shown.cert.kind === 'tier' ? 'ct.t.tier' : shown.cert.kind === 'gift' ? 'ct.t.gift' : 'ct.t.level');
    shareView(card.current, t('n.shareMsg', { b: label }));
  };
  const owned = useHelpRequests(uid);
  const offered = useMyTickets(uid);
  const helpCount = owned.waiting + offered.waiting;
  const givingCount = sips.filter((x) => ['active', 'authenticated', 'pending'].includes(x.status)).length + gives.filter((g) => g.status === 'pledged').length;
  const toNext = s.nextNeed ? s.nextNeed - s.points : 0;
  const tiles: [string | number, string][] = [[s.counts.posts, 'n.imp.tPosts'], [s.counts.helps, 'n.imp.tHelp'], [inr(s.counts.rupees), 'ip.tGiven'], [s.counts.joined, 'n.imp.tComm']];

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsWrap} contentContainerStyle={styles.chips}>
        {([['overview', 'ip.tab.overview', 0], ['help', 'ip.tab.help', helpCount], ['giving', 'ip.tab.giving', givingCount], ['badges', 'ip.tab.badges', s.badges.filter((b) => b.tier > 0).length]] as [Tab, string, number][]).map(([id, key, n]) => (
          <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} style={[styles.chip, tab === id && styles.chipOn]}>
            <Text style={[styles.chipText, tab === id && styles.chipTextOn]}>{t(key)}</Text>
            {n > 0 ? <View style={[styles.chipCount, tab === id && styles.chipCountOn]}><Text style={[styles.chipCountText, tab === id && styles.chipCountTextOn]}>{n}</Text></View> : null}
          </Pressable>
        ))}
      </ScrollView>

      {tab === 'overview' ? (
        <>
      <View style={styles.levelCard}>
        <Medal icon={LEVEL_ICON[s.level]} tier={Math.max(1, Math.min(3, s.level)) as Tier} size={64} />
        <View style={styles.grow}>
          <Text style={styles.levelKicker}>{t('lvl.label', { n: s.level })}</Text>
          <Text style={styles.levelName}>{t(`lvl.${s.level}`)}</Text>
          <Text style={styles.levelPts}>{t('lvl.pts', { n: s.points })}</Text>
          {s.nextNeed ? <Bar value={s.points - (s.prevNeed ?? 0)} total={s.nextNeed - (s.prevNeed ?? 0)} /> : null}
          <Text style={styles.levelNext}>{s.nextNeed ? t('lvl.next', { n: toNext, l: t(`lvl.${s.level + 1}`) }) : t('lvl.max')}</Text>
        </View>
      </View>

      <View style={styles.tiles}>
        {tiles.map(([n, k]) => (
          <View key={k} style={styles.tile}><Text style={styles.tileN}>{n}</Text><Text style={styles.tileL}>{t(k)}</Text></View>
        ))}
      </View>

      <View style={styles.sec}>
        <Text accessibilityRole="header" style={styles.h2}>{t('n.imp.posts')}</Text>
        {posts.length ? capPosts.shown.map((p) => {
          const st = p.status === 'approved' ? 'approved' : p.status === 'rejected' ? 'rejected' : 'pending';
          return (
            <Pressable key={p.id} onPress={() => setOpen(p)} accessibilityRole="button" accessibilityLabel={p.title} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <View style={styles.grow}>
                <Text style={styles.itemTitle} numberOfLines={2}>{p.title || '—'}</Text>
                <Text style={styles.small}>{t(`mp.flow.${p.flow}`)} · {formatDate(iso(p.at), { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              </View>
              <Pill label={t(`n.imp.st.${st}`)} tone={st === 'approved' ? 'leaf' : st === 'rejected' ? 'brick' : 'amber'} />
              <Icon name="chev" size={18} color={colors.slate} />
            </Pressable>
          );
        }) : <Text style={styles.small}>{t('n.imp.postsNone')}</Text>}
        {posts.length ? <ViewAll cap={capPosts} /> : null}
        {posts.length ? <Text style={styles.small}>{t('mp.hint')}</Text> : null}
      </View>

        </>
      ) : null}

      {tab === 'help' ? (
        <>
      <HelpRequests />
      <MyHelpTickets />

        </>
      ) : null}

      {tab === 'giving' ? (
        <>
      <View style={styles.sec}>
        <Text accessibilityRole="header" style={styles.h2}>{t('sip.title')}</Text>
        {sips.length ? capSips.shown.map((x) => {
          const live = ['authenticated', 'active', 'pending', 'halted', 'paused'].includes(x.status);
          return (
            <View key={x.id} style={styles.item}>
              <View style={styles.grow}>
                <Text style={styles.itemTitle} numberOfLines={2}>{x.title || '—'}</Text>
                <Text style={styles.small}>{t('sip.perMonth', { a: inr(x.amount) })} · {t('sip.paid', { n: x.paidCount, a: inr(x.totalPaid) })}</Text>
                <Text style={[styles.gv, x.status === 'active' && styles.gvOk, (x.status === 'halted' || x.status === 'cancelled') && styles.gvNo]}>
                  {t(`sip.st.${x.status}`)}{live && x.nextChargeAt ? ` · ${t('sip.next', { d: formatDate(iso(x.nextChargeAt), { day: 'numeric', month: 'short' }) })}` : ''}
                </Text>
              </View>
              {live ? (
                <View style={styles.sipBtns}>
                  {x.mode === 'reminder' ? <Button small label={t('sip.payMonth')} onPress={() => store.showSheet({ kind: 'donate', id: x.postId, sip: x.id })} /> : null}
                  <Button small variant="ghost" label={t('sip.stop')} onPress={() => Alert.alert(t('sip.stopT'), t('sip.stopD'), [
                    { text: t('c.close'), style: 'cancel' },
                    { text: t('sip.stop'), style: 'destructive', onPress: () => { stopSip(x).then(() => store.toast(t('sip.stopped'))).catch((e: Error) => store.toast(e.message)); } },
                  ])} />
                </View>
              ) : null}
            </View>
          );
        }) : <Text style={styles.small}>{t('sip.none')}</Text>}
        {sips.length ? <ViewAll cap={capSips} /> : null}
      </View>

      <View style={styles.sec}>
        <Text accessibilityRole="header" style={styles.h2}>{t('ip.giving')}</Text>
        {gives.length ? capGives.shown.map((g: Give) => (
          <View key={g.id} style={styles.item}>
            <View style={styles.grow}>
              <Text style={styles.itemTitle} numberOfLines={2}>{g.title || '—'}</Text>
              <Text style={styles.small}>{inr(g.amount)} · {formatDate(iso(g.at), { day: 'numeric', month: 'short' })}</Text>
              <Text style={[styles.gv, g.status === 'received' && styles.gvOk, g.status === 'not_received' && styles.gvNo]}>
                {g.via === 'sip' && g.status === 'pledged' ? t('gv.sipWait') : g.via === 'sip' && g.status === 'not_received' ? t('gv.no') : g.via === 'sip' ? `✓ ${t('gv.sip')}${g.confirmedAt ? ` · ${formatDate(iso(g.confirmedAt), { day: 'numeric', month: 'short' })}` : ''}` : g.status === 'received' ? `✓ ${t('gv.ok')}${g.confirmedAt ? ` · ${formatDate(iso(g.confirmedAt), { day: 'numeric', month: 'short' })}` : ''}` : g.status === 'not_received' ? t('gv.no') : t('gv.wait')}
              </Text>
            </View>
          </View>
        )) : <Text style={styles.small}>{t('gv.none')}</Text>}
        {gives.length ? <ViewAll cap={capGives} /> : null}
      </View>

        </>
      ) : null}

      {tab === 'badges' ? (
        <>
      <View style={styles.sec}>
        <Text accessibilityRole="header" style={styles.h2}>{t('n.myBadges')}</Text>
        {capBadges.shown.map((b) => {
          const nextT = b.tier < 3 ? (b.tiers[b.tier as 0 | 1 | 2] ?? 0) : 0;
          return (
            <View key={b.id} style={[styles.badge, { backgroundColor: b.tier ? TIER_SOFT[b.tier] : colors.paper }, !b.tier && styles.badgeLocked]}>
              <Medal icon={b.icon} tier={b.tier} />
              <View style={styles.grow}>
                <View style={styles.inline}>
                  <Text style={styles.itemTitle}>{t(`ab.${b.id}`)}</Text>
                  {b.tier ? <View style={[styles.tierChipSm, { backgroundColor: TIER_COLOR[b.tier] }]}><Text style={styles.tierChipText}>{t(`tier.${b.tier}`)}</Text></View> : null}
                </View>
                <Text style={styles.small}>{t(`ab.${b.id}D`)}</Text>
                {b.tier < 3 ? <><Bar value={b.value} total={nextT} /><Text style={styles.small}>{t('ab.prog', { v: b.id === 'generous' ? inr(b.value) : b.value, t: b.id === 'generous' ? inr(nextT) : nextT, tier: t(`tier.${b.tier + 1}`) })}</Text></> : <Text style={styles.top}>{t('ab.top')}</Text>}
              </View>
              {b.tier ? (
                <Pressable onPress={() => setShown({ kind: 'badge', badge: b })} accessibilityRole="button" accessibilityLabel={`${t('n.share')}: ${t(`ab.${b.id}`)}`} style={styles.shareBtn} hitSlop={8}>
                  <Icon name="share" size={18} color={colors.tealDark} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
        <ViewAll cap={capBadges} />
      </View>

      <View style={styles.sec}>
        <Text accessibilityRole="header" style={styles.h2}>{t('n.myCerts')}</Text>
        {s.certs.length ? capCerts.shown.map((c) => (
          <Pressable key={c.id} onPress={() => setShown({ kind: 'cert', cert: c })} accessibilityRole="button" style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <Icon name="check" size={20} color={colors.tealDark} />
            <View style={styles.grow}>
              <Text style={styles.itemTitle}>{t(c.kind === 'tier' ? 'ct.t.tier' : c.kind === 'gift' ? 'ct.t.gift' : 'ct.t.level')}</Text>
              <Text style={styles.small} numberOfLines={1}>{certName(c, t)}</Text>
            </View>
            <Text style={styles.link}>{t('n.certView')}</Text>
          </Pressable>
        )) : <Text style={styles.small}>{t('n.certNone2')}</Text>}
        {s.certs.length ? <ViewAll cap={capCerts} /> : null}
      </View>

        </>
      ) : null}

      {shown ? (
        <Sheet visible onClose={() => setShown(null)} title={shown.kind === 'badge' ? t(`ab.${shown.badge.id}`) : t(shown.cert.kind === 'tier' ? 'ct.t.tier' : shown.cert.kind === 'gift' ? 'ct.t.gift' : 'ct.t.level')}>
          <View ref={card} collapsable={false} style={styles.capture}>
            {shown.kind === 'badge' ? <BadgeCard b={shown.badge} who={who} /> : <CertCard cert={shown.cert} who={who} uid={uid} />}
          </View>
          <Button label={t('n.share')} icon="share" block onPress={share} />
        </Sheet>
      ) : null}
      {open ? <MyPostSheet post={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  chipsWrap: { flexGrow: 0, marginTop: space.m },
  chips: { paddingHorizontal: space.l, gap: space.s },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.tealDark, borderColor: colors.tealDark },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.slate },
  chipTextOn: { color: colors.white },
  chipCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.heart, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  chipCountOn: { backgroundColor: colors.white },
  chipCountText: { fontSize: 11, fontWeight: '800', color: colors.white },
  chipCountTextOn: { color: colors.tealDark },
  levelCard: { flexDirection: 'row', gap: 14, alignItems: 'center', marginHorizontal: space.l, marginTop: space.l, padding: space.l, borderRadius: radius.l, backgroundColor: colors.tealDeep },
  levelKicker: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, color: '#BFE9E7' },
  levelName: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.white },
  levelPts: { fontSize: 14, color: '#E6F7F6', marginBottom: 6 },
  levelNext: { fontSize: 12, color: '#BFE9E7', marginTop: 4 },
  bar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(11,42,31,0.12)', overflow: 'hidden', marginTop: 4 },
  barFill: { height: 8, borderRadius: 4, backgroundColor: '#F5C451' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: space.l, marginTop: space.m },
  tile: { width: '48%', flexGrow: 1, backgroundColor: colors.tealSoft, borderRadius: radius.m, paddingVertical: 12, alignItems: 'center' },
  tileN: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.tealDeep },
  tileL: { fontSize: 12, lineHeight: 16, color: colors.tealDeep, textAlign: 'center', marginTop: 2, paddingHorizontal: 4 },
  sec: { paddingHorizontal: space.l, marginTop: space.l, gap: space.s },
  h2: { ...type.title, color: colors.ink },
  link: { fontSize: 15, fontWeight: '700', color: colors.tealDark },
  small: { ...type.small, color: colors.slate },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  pressed: { opacity: 0.6 },
  itemTitle: { ...type.cardTitle, fontSize: 15, color: colors.ink },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  gv: { fontSize: 13, fontWeight: '700', color: colors.amber },
  sipBtns: { gap: 6, alignItems: 'stretch' },
  gvOk: { color: colors.leaf },
  gvNo: { color: colors.brick },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.m },
  badgeLocked: { opacity: 0.75 },
  top: { fontSize: 13, fontWeight: '800', color: '#8A6500' },
  shareBtn: { padding: 10, borderRadius: 999, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  medal: { alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  tierChip: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 999 },
  tierChipSm: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tierChipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: colors.white },
  capture: { backgroundColor: colors.white, padding: 8, borderRadius: radius.m },
  shareCard: { alignItems: 'center', gap: 8, padding: space.xl, borderRadius: radius.m, borderWidth: 3 },
  bcTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  bcWho: { fontSize: 20, fontWeight: '800', fontStyle: 'italic', color: colors.tealDeep },
  bcTag: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colors.tealDeep, marginTop: 6 },
  cert: { padding: 6, borderRadius: radius.m, borderWidth: 3, backgroundColor: '#FFFCF3' },
  certInner: { alignItems: 'center', gap: 8, padding: space.l, borderRadius: 10, borderWidth: 1 },
  certKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 2, color: colors.tealDeep },
  certTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  certName: { fontSize: 26, lineHeight: 32, fontWeight: '800', fontStyle: 'italic', color: colors.tealDeep, textAlign: 'center' },
  certBody: { ...type.body, color: colors.ink, textAlign: 'center' },
  certRule: { alignSelf: 'stretch', height: 2, marginVertical: 4 },
  certFoot: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between', gap: 16, marginTop: 10 },
  certCol: { flex: 1, alignItems: 'center', gap: 2 },
  certSign: { fontSize: 18, fontStyle: 'italic', fontWeight: '700', color: colors.tealDeep },
  certNo: { fontSize: 14, fontWeight: '800', letterSpacing: 1, color: colors.ink },
  certLine: { alignSelf: 'stretch', height: 1, backgroundColor: colors.slate },
  certTiny: { fontSize: 11, color: colors.slate, textAlign: 'center' },
  certNote: { fontSize: 11, color: colors.slate, textAlign: 'center', marginTop: 6 },
});
