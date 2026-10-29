import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PostPhotos from '../components/PostPhotos';
import { firebaseReady } from '../firebase';
import { NAV_HEIGHT } from '../components/BottomNav';
import { CTA_HEIGHT, DetailTop, NotFound, Row, StickyCta, detailStyles as d } from '../components/Detail';
import { Badge, Button, CauseBadge, Legend, Panel, PanelTitle, SampleTag, StatGrid, TwoLayerBar, UntrTag, VerifyBadge } from '../components/ui';
import { campaignOf, campaignPledged, campaignReceived, campaignSupporters, fundPct, orgOf, pledgePct } from '../data';
import { inr } from '../format';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { colors, space, type } from '../theme';

// Fundraiser detail, as in the prototype. All money is simulated: "received" and "pledged" are always shown apart,
// and the verification panel is a sample status, not a real check.
export default function CampaignScreen({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { showSheet, toast, openDiscover, donations, confirmPledge } = useStore();
  const c = campaignOf(id);
  if (!c) return <NotFound onBack={() => openDiscover({ kind: 'fund' })} />;

  const ds = donations[c.id];
  const r = fundPct(c, ds);
  const p = pledgePct(c, ds);
  const o = orgOf(c.org);
  const state = ({ docs: 'checked', pending: 'submitted', unverified: 'missing' } as const)[c.verify];
  const checks = c.type === 'org' ? ['o1', 'o2', 'o3'] : ['i1', 'i2', 'i3'];
  const typeLabel = t(c.type === 'org' ? 'fund.org' : 'fund.individual');
  const donate = () => showSheet({ kind: 'donate', id: c.id });
  const share = () => showSheet({ kind: 'share', id: c.id });
  const urgent = c.urgent ? <Badge label={t('fund.urgent')} tone="brick" /> : null;

  return (
    <View style={d.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: NAV_HEIGHT + insets.bottom + CTA_HEIGHT + space.xxl }}>
        <DetailTop cause={c.cat} id={c.id} placeholder={t('fund.placeholder')} />
        {firebaseReady ? <PostPhotos postId={c.id} /> : null}
        <View style={d.wrap}>
          <Row>
            <VerifyBadge status={c.verify} />
            <CauseBadge cause={c.cat} />
            {urgent}
            {firebaseReady ? null : <><SampleTag label={t('fund.sample')} /><UntrTag /></>}
          </Row>
          <Text accessibilityRole="header" style={d.h1}>{c.title}</Text>
          <Text style={d.muted}>{c.short}</Text>

          <Panel>
            <PanelTitle>{t('cd.head', { r })}</PanelTitle>
            <TwoLayerBar id={`c-${c.id}`} solid={r} hatched={p} label={t('cd.barAria', { r, p })} />
            <Legend items={[{ label: t('leg.simRecv'), kind: 'solid' }, { label: t('leg.pledgedNot'), kind: 'hatched' }]} />
            <StatGrid
              items={[
                { value: inr(campaignReceived(c, ds)), label: t('cd.recv') },
                { value: inr(campaignPledged(ds)), label: t('cd.pledged') },
                { value: inr(c.goal), label: t('cd.goal') },
                { value: String(campaignSupporters(c, ds)), label: `${t('cd.supporters')} · ${t('c.daysLeft', { n: c.days })}` },
              ]}
            />
            <Text style={d.small}>{t('cd.note')}</Text>
            <Button label={t('b.donate')} block onPress={donate} />
            <Button label={t('b.shareC')} icon="share" variant="ghost" block onPress={share} />
          </Panel>

          <Panel>
            <PanelTitle>{t('cd.story')}</PanelTitle>
            <Text style={d.body}>{c.story}</Text>
          </Panel>

          <Panel>
            <PanelTitle>{t('cd.people')}</PanelTitle>
            <Text style={styles.dt}>{t('cd.beneficiary')}</Text>
            <Text style={d.body}>{c.beneficiary} — {c.benAbout}</Text>
            <Text style={styles.dt}>{t('cd.organizer')}</Text>
            <Text style={d.body}>
              {c.organizer}
              {o ? <Text> · <Text style={styles.link} accessibilityRole="button" onPress={() => showSheet({ kind: 'org', id: o.id })}>{t('cd.viewOrg')}</Text></Text> : null}
            </Text>
            <Text style={styles.dt}>{t('cd.type')}</Text>
            <Text style={d.body}>{typeLabel}</Text>
          </Panel>

          <Panel>
            <PanelTitle>{t('cd.funds')}</PanelTitle>
            {c.funds.map((f) => (
              <View key={f.label} style={styles.fund}>
                <View style={styles.fundRow}>
                  <Text style={[d.body, styles.flex]}>{f.label}</Text>
                  <Text style={styles.bold}>{inr(f.amount)}</Text>
                </View>
                <View style={styles.track}><View style={[styles.fill, { width: `${Math.round((f.amount / c.goal) * 100)}%` }]} /></View>
              </View>
            ))}
          </Panel>

          <Panel>
            <PanelTitle>{t('cd.updates')}</PanelTitle>
            {c.updates.map((u) => (
              <View key={u.text} style={styles.update}>
                <Text style={styles.when}>{t('cd.ago', { n: u.ago })}</Text>
                <Text style={d.body}>{u.text}</Text>
              </View>
            ))}
          </Panel>

          <Panel>
            <PanelTitle>{t('v.title')}</PanelTitle>
            <VerifyBadge status={c.verify} />
            <Text style={d.body}>{t(`v.exp.${c.verify}`)}</Text>
            <Text style={styles.bold}>{t(c.type === 'org' ? 'v.whatOrg' : 'v.whatInd')}</Text>
            {checks.map((k) => (
              <View key={k} style={styles.check}>
                <Text style={[d.body, styles.flex]}>{t(`v.${k}`)}</Text>
                <Text style={[d.small, state === 'checked' && { color: colors.leaf, fontWeight: '700' }]}>{t(`v.${state}`)}</Text>
              </View>
            ))}
            <Text style={d.small}>{t('v.sampleNote')}</Text>
          </Panel>

          <Panel>
            <PanelTitle>{t('cd.donors')}</PanelTitle>
            {ds.map((x, i) => ({ x, i })).reverse().map(({ x, i }) => {
              const who = x.mine ? `${x.n || t('cd.anon')} · ${t('cd.you')}` : x.n || t('cd.anon');
              return (
                <View key={`${i}-${x.a}`} style={styles.donor}>
                  <View style={styles.donorRow}>
                    <Text style={styles.bold}>{who}</Text>
                    <Text style={d.body}>· {inr(x.a)}</Text>
                    <Badge label={t(x.s === 'received' ? 'cd.statusRecv' : 'cd.statusPledged')} tone={x.s === 'received' ? 'leaf' : 'amber'} />
                  </View>
                  {x.m ? <Text style={d.small}>{x.m}</Text> : null}
                  {x.s === 'pledged' ? (
                    <Text style={styles.link} accessibilityRole="button" onPress={() => { confirmPledge(c.id, i); toast(t('t.confirmed')); }}>{t('cd.confirm')}</Text>
                  ) : null}
                </View>
              );
            })}
            <Text style={d.small}>{t('cd.earlier', { n: c.base.donors })}</Text>
          </Panel>

          <Button label={t('b.report')} variant="ghost" small onPress={() => showSheet({ kind: 'report', id: c.id })} style={styles.report} />
        </View>
      </ScrollView>
      <StickyCta shareLabel={t('b.shareC')} onShare={share} label={t('b.donate')} onPress={donate} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dt: { ...type.tiny, color: colors.slate, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
  link: { color: colors.tealDark, fontWeight: '700', textDecorationLine: 'underline' },
  bold: { ...type.body, fontWeight: '800', color: colors.ink },
  fund: { gap: 6, paddingVertical: 4 },
  fundRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#EAF0EC', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.teal, borderRadius: 3 },
  update: { borderLeftWidth: 3, borderLeftColor: colors.teal, paddingLeft: 12, paddingVertical: 4, gap: 2 },
  when: { fontSize: 11, fontWeight: '800', color: colors.slate, letterSpacing: 0.5, textTransform: 'uppercase' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line },
  donor: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, gap: 4 },
  donorRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  report: { alignSelf: 'flex-start' },
});
