import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_HEIGHT } from '../components/BottomNav';
import ImpactMine from '../components/ImpactMine';
import { Badge, Button, CauseBadge, Notice, PageHead, Panel, SampleTag } from '../components/ui';
import { campaignOf, campaignPledged, campaignReceived, campaigns, myVolunteering, opportunities, outcomes, projects, type CauseId, type Outcome } from '../data';
import { inr } from '../format';
import { firebaseReady } from '../firebase';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, radius, space, type } from '../theme';

const num = (n: number) => n.toLocaleString('en-IN');

// Impact, in the prototype's three parts: Overview (community, sample data), My contributions (money, simulated,
// this session only) and My volunteering (time). Money and hours are never added together, and every figure
// says whether it is reported, received or verified. All numbers are computed from the sample data.
export default function ImpactScreen() {
  const insets = useSafeAreaInsets();
  const { t, tr, formatDate } = useT();
  const { donations, myDonations, joined, open, openDiscover, goTab } = useStore();

  const sum = (k: 'received' | 'hours', f: (p: (typeof projects)[number]) => boolean = () => true) => projects.filter(f).reduce((a, p) => a + p[k], 0);
  const funded = sum('received') + campaigns.reduce((a, c) => a + campaignReceived(c, donations[c.id]), 0);
  const waiting = projects.reduce((a, p) => a + (p.raised - p.received), 0) + campaigns.reduce((a, c) => a + campaignPledged(donations[c.id]), 0);
  const completed = projects.filter((p) => p.status === 'Completed');
  const tiles = [
    { label: t('ov.funds'), value: inr(funded), note: t('ov.fundsN', { p: inr(waiting) }) },
    { label: t('ov.hours'), value: t('k.hrs', { n: num(sum('hours')) }), note: t('k.hoursN', { n: num(sum('hours', (p) => !!p.verified)) }) },
    { label: t('ov.done'), value: String(completed.length), note: t('ov.doneN', { n: completed.filter((p) => p.verified).length }) },
  ];

  const total = myDonations.reduce((a, x) => a + x.a, 0);
  const byCause: Partial<Record<CauseId, number>> = {};
  myDonations.forEach((x) => { const c = campaignOf(x.cid); if (c) byCause[c.cat] = (byCause[c.cat] ?? 0) + x.a; });
  const hoursDone = myVolunteering.reduce((a, v) => a + v.hours, 0);
  const hoursVerified = myVolunteering.filter((v) => v.status === 'verified').reduce((a, v) => a + v.hours, 0);
  const signed = opportunities.filter((o) => joined.includes(o.id));

  const outcomeBadge = (o: Outcome) =>
    o.verified === 0 ? <Badge label={t('imp.notV')} tone="grey" />
      : o.verified < o.reported ? <Badge label={t('imp.partly')} tone="amber" />
        : <Badge label={t('imp.verified')} tone="leaf" icon="check" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: NAV_HEIGHT + insets.bottom + space.xxl }}>
      <PageHead title={t('imp.title')} subtitle={t('imp.sub')} />
      {firebaseReady ? null : <Notice text={tr('imp.notice')} rich style={styles.notice} />}

      <ImpactMine />

      {firebaseReady ? null : (
        <>
      {/* Overview */}
      <View style={styles.sec}>
        <Text accessibilityRole="header" style={styles.h2}>{t('imp.overview')}</Text>
        <Text style={styles.muted}>{t('imp.overviewSub')}</Text>
        {tiles.map((k) => (
          <View key={k.label} style={styles.tile}>
            <Text style={styles.lbl}>{k.label}</Text>
            <Text style={styles.tileValue}>{k.value}</Text>
            <Text style={styles.small}>{k.note}</Text>
          </View>
        ))}
        <Panel>
          <Text accessibilityRole="header" style={styles.h3}>{t('ov.outT')}</Text>
          <Text style={styles.small}>{t('ov.outD')}</Text>
          {outcomes.map((o) => (
            <View key={o.k} style={styles.outRow}>
              <View style={styles.grow}>
                <Text style={styles.strong}>{t(`o.${o.k}`)}</Text>
                <Text style={styles.small}>{t('ov.row', { r: num(o.reported), v: num(o.verified) })}</Text>
              </View>
              {outcomeBadge(o)}
            </View>
          ))}
        </Panel>
      </View>

      {/* My contributions: money, simulated */}
      <View style={styles.sec}>
        <Text accessibilityRole="header" style={styles.h2}>{t('imp.mine')}</Text>
        <Text style={styles.muted}>{t('imp.mineSub')}</Text>
        {myDonations.length ? (
          <Panel>
            <Text style={styles.big}>{inr(total)}</Text>
            <SampleTag label={t('dn.simTag')} />
            <Text style={styles.h3}>{t('my.causes')}</Text>
            <View style={styles.chips}>
              {(Object.entries(byCause) as [CauseId, number][]).sort((a, b) => b[1] - a[1]).map(([id, a]) => (
                <View key={id} style={styles.chip}><CauseBadge cause={id} /><Text style={styles.strong}>{inr(a)}</Text></View>
              ))}
            </View>
            <Text style={styles.h3}>{t('my.list')}</Text>
            {[...myDonations].reverse().map((x, i) => {
              const c = campaignOf(x.cid);
              if (!c) return null;
              return (
                <View key={`${x.cid}-${i}`} style={styles.outRow}>
                  <View style={styles.grow}>
                    <Pressable onPress={() => open({ name: 'campaign', id: c.id })} accessibilityRole="link">
                      <Text style={styles.link}>{c.title}</Text>
                    </Pressable>
                    <View style={styles.inline}><Text style={styles.small}>{x.n || t('cd.anon')} ·</Text><SampleTag label={t('dn.simTag')} /></View>
                  </View>
                  <Text style={styles.strong}>{inr(x.a)}</Text>
                </View>
              );
            })}
            <Text style={styles.small}>{t('my.simNote')}</Text>
          </Panel>
        ) : (
          <Panel>
            <Text style={styles.muted}>{t('imp.myNone')}</Text>
            <Button label={t('imp.myBrowse')} variant="ghost" small style={styles.self} onPress={() => openDiscover({ kind: 'fund', cat: 'all' })} />
          </Panel>
        )}
      </View>

        </>
      )}

      {/* My volunteering: time */}
      <View style={styles.sec}>
        <Text accessibilityRole="header" style={styles.h2}>{t('imp.vol')}</Text>
        <Text style={styles.muted}>{t('imp.volSub')}</Text>
        <Panel>
          <Text style={styles.big}>{t('k.hrs', { n: hoursDone })}</Text>
          <Text style={styles.small}>{t('vol.hours')} · {t('k.hoursN', { n: hoursVerified })}</Text>
          <View style={styles.inline}><Text style={styles.h3}>{t('vol.acts')}</Text><SampleTag label={t('vol.sample')} /></View>
          {myVolunteering.map((v) => (
            <View key={v.k} style={styles.outRow}>
              <View style={styles.grow}>
                <Text style={styles.strong}>{t(`va.${v.k}`)}</Text>
                <Text style={styles.small}>{formatDate(v.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {t('k.hrs', { n: v.hours })}</Text>
              </View>
              <Badge label={t(v.status === 'verified' ? 'imp.verified' : 'imp.rep')} tone={v.status === 'verified' ? 'leaf' : 'grey'} />
            </View>
          ))}
        </Panel>
        <Panel style={styles.gapTop}>
          <Text style={styles.h3}>{t('vol.signed')}</Text>
          {signed.length ? signed.map((o) => (
            <View key={o.id} style={styles.outRow}>
              <View style={styles.grow}>
                <Text style={styles.strong}>{o.title}</Text>
                <Text style={styles.small}>{o.org} · {o.when}</Text>
              </View>
            </View>
          )) : <Text style={styles.small}>{t('vol.signedNone')}</Text>}
          <Text style={styles.small}>{t('vol.signedD')}</Text>
          <Button label={t('vol.find')} variant="ghost" small style={styles.self} onPress={() => goTab('community')} />
        </Panel>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  notice: { marginHorizontal: space.l, marginTop: space.s },
  sec: { paddingHorizontal: space.l, marginTop: space.xxl, gap: space.s },
  h2: { ...type.title, color: colors.ink },
  h3: { ...type.cardTitle, color: colors.ink, marginTop: 4 },
  muted: { ...type.body, color: colors.slate },
  small: { ...type.small, color: colors.slate },
  strong: { ...type.body, fontWeight: '700', color: colors.ink },
  link: { ...type.body, fontWeight: '700', color: colors.tealDark, textDecorationLine: 'underline' },
  big: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: colors.ink },
  tile: { padding: space.l, borderRadius: radius.m, backgroundColor: colors.tealSoft, gap: 2 },
  lbl: { ...type.tiny, color: colors.tealDeep, letterSpacing: 0.5, textTransform: 'uppercase' },
  tileValue: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.tealDeep },
  outRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  self: { alignSelf: 'flex-start' },
  gapTop: { marginTop: space.m },
});
